import { Router, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { extractBillWithGeminiVision } from '../services/geminiOcrService';
import { rupeesToPaise, formatINR } from '../utils/paise';

const router = Router();

async function resolveOrCreateCategory(params: {
  db: any;
  workspaceId: string;
  userId: string;
  categoryName: string;
  kind: 'EXPENSE' | 'INCOME';
}): Promise<string | null> {
  try {
    const { data: existing } = await params.db
      .from('categories')
      .select('id')
      .eq('workspace_id', params.workspaceId)
      .eq('name', params.categoryName)
      .eq('kind', params.kind)
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: created } = await params.db
      .from('categories')
      .insert({
        workspace_id: params.workspaceId,
        user_id: params.userId,
        name: params.categoryName,
        kind: params.kind,
      })
      .select('id')
      .single();

    return created?.id || null;
  } catch {
    return null;
  }
}

/**
 * POST /api/v1/ai/parse-receipt (also mounted at /api/v1/ingestion/bill-ocr)
 * Ultra-fast receipt OCR & zero-touch transaction auto-save.
 */
router.post(
  ['/ai/parse-receipt', '/parse-receipt', '/ingestion/bill-ocr'],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        res.status(400).json({ error: 'X-Workspace-Id header is required' });
        return;
      }

      const {
        imageBase64,
        mimeType = 'image/jpeg',
        saveToVault = false,
        vaultTitle,
        vaultDocType = 'BILL',
        vaultExpiryDate,
      } = req.body;

      if (!imageBase64) {
        res.status(400).json({ error: 'imageBase64 is required for Receipt OCR' });
        return;
      }

      // 1. Upload receipt image to Supabase Storage (documents-vault bucket)
      let receiptImagePath: string | null = null;
      let receiptImageUrl: string | null = null;

      try {
        const ext = mimeType && mimeType.includes('pdf') ? 'pdf' : 'jpg';
        const fileName = `${req.userId}/receipt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
        const buffer = Buffer.from(imageBase64, 'base64');
        if (supabaseAdmin) {
          const { error: uploadErr } = await supabaseAdmin.storage
            .from('documents-vault')
            .upload(fileName, buffer, {
              contentType: mimeType || 'image/jpeg',
              upsert: true,
            });

          if (!uploadErr) {
            receiptImagePath = fileName;
            const { data: signed } = await supabaseAdmin.storage
              .from('documents-vault')
              .createSignedUrl(fileName, 86400 * 7); // 7 days
            if (signed?.signedUrl) {
              receiptImageUrl = signed.signedUrl;
            }
          } else {
            console.warn('Storage upload notice:', uploadErr.message);
          }
        }
      } catch (storageErr) {
        console.warn('Storage upload exception (continuing OCR):', storageErr);
      }

      // 2. Perform low-latency OCR with Gemini 1.5 Flash (15s timeout)
      const ocrResult = await extractBillWithGeminiVision({
        imageBase64,
        mimeType,
      });

      const merchantName = ocrResult.merchantName || 'Receipt Expense';
      const categoryName = ocrResult.suggestedCategory || 'Grocery & Rashan';
      const amountRupees = ocrResult.totalRupees;

      // 3. Auto-save transaction directly if amount is present
      let savedTx: any = null;
      let vaultDocId: string | null = null;

      if (amountRupees && amountRupees > 0) {
        const amountPaise = rupeesToPaise(amountRupees);
        const categoryId = await resolveOrCreateCategory({
          db: req.db!,
          workspaceId,
          userId: req.userId!,
          categoryName,
          kind: 'EXPENSE',
        });

        const detectedPayment = ocrResult.paymentVia;
        const validPayments = ['UPI', 'CARD', 'BANK_TRANSFER', 'CASH'];
        const paymentVia =
          detectedPayment && validPayments.includes(detectedPayment)
            ? detectedPayment
            : 'OTHER';

        const basePayload: any = {
          workspace_id: workspaceId,
          user_id: req.userId!,
          category_id: categoryId,
          kind: 'EXPENSE',
          amount_paise: amountPaise,
          payment_via: paymentVia,
          merchant_or_payee: merchantName,
          description: ocrResult.summaryNote || `Scanned bill from ${merchantName}`,
          receipt_image_url: receiptImageUrl,
        };

        const fullPayload: any = {
          ...basePayload,
          receipt_image_path: receiptImagePath,
          source_type: 'BILL',
        };

        let insertRes = await req.db!
          .from('transactions')
          .insert(fullPayload)
          .select('*')
          .single();

        if (insertRes.error) {
          console.warn('Full transaction insert failed in aiRoutes, retrying with base payload:', insertRes.error.message);
          insertRes = await req.db!
            .from('transactions')
            .insert(basePayload)
            .select('*')
            .single();
          if (insertRes.error) {
            console.error('Base transaction insert also failed in aiRoutes:', insertRes.error);
          }
        }

        const tx = insertRes.data;

        if (tx) {
          savedTx = tx;

          // 4. Automatic Bill Vault Preservation if toggle is enabled
          if (saveToVault && receiptImagePath) {
            try {
              const vMeta = {
                totalRupees: amountRupees,
                merchantName,
                file_path: receiptImagePath,
              };
              let vRes = await req.db!
                .from('documents_vault')
                .insert({
                  workspace_id: workspaceId,
                  user_id: req.userId!,
                  title: vaultTitle?.trim() || `${merchantName} Bill`,
                  doc_type: vaultDocType,
                  file_url: receiptImageUrl || '',
                  file_path: receiptImagePath,
                  expiry_date: vaultExpiryDate || null,
                  linked_transaction_id: tx.id,
                  metadata: vMeta,
                })
                .select('id')
                .single();

              if (vRes.error && (vRes.error.message?.includes('file_path') || vRes.error.code === 'PGRST204')) {
                vRes = await req.db!
                  .from('documents_vault')
                  .insert({
                    workspace_id: workspaceId,
                    user_id: req.userId!,
                    title: vaultTitle?.trim() || `${merchantName} Bill`,
                    doc_type: vaultDocType,
                    file_url: receiptImageUrl || '',
                    expiry_date: vaultExpiryDate || null,
                    linked_transaction_id: tx.id,
                    metadata: vMeta,
                  })
                  .select('id')
                  .single();
              }

              vaultDocId = vRes.data?.id || null;
            } catch (vErr) {
              console.warn('Vault insert notice:', vErr);
            }
          }
        }
      } else {
        // Fallback: save to ingestion_drafts for manual review without hard error
        try {
          await req.db!.from('ingestion_drafts').insert({
            workspace_id: workspaceId,
            user_id: req.userId!,
            source: 'BILL',
            intent: 'EXPENSE',
            status: 'PENDING_CONFIRMATION',
            raw_input_text: `Scanned receipt from ${merchantName}`,
            extracted_contact_name: merchantName,
            extracted_category_name: categoryName,
            payment_via: 'UNSPECIFIED',
            structured_payload: {
              receiptImagePath,
              receiptImageUrl,
              ocrResult,
            },
          });
        } catch (draftErr) {
          console.warn('Draft save notice:', draftErr);
        }
      }

      res.status(200).json({
        success: true,
        autoSaved: Boolean(savedTx),
        amount: amountRupees,
        merchant: merchantName,
        date: ocrResult.billDate,
        savedSummary: savedTx
          ? {
              id: savedTx.id,
              title: merchantName,
              amountPaise: savedTx.amount_paise,
              amountFormatted: formatINR(savedTx.amount_paise),
              categoryName,
              paymentVia: 'UNSPECIFIED',
              receiptImagePath,
              receiptImageUrl,
              vaultDocId,
            }
          : null,
        ocrSummary: ocrResult,
      });
    } catch (err: unknown) {
      console.warn('Receipt OCR processing exception:', err);
      // Clean fallback response - do not throw hard 500 screen!
      res.status(200).json({
        success: false,
        autoSaved: false,
        amount: null,
        merchant: 'Receipt Expense',
        date: new Date().toISOString().slice(0, 10),
        ocrSummary: {
          merchantName: 'Receipt Expense',
          totalRupees: null,
          suggestedCategory: 'Bills & Utilities',
          paymentVia: 'UNSPECIFIED',
          summaryNote: 'Scanned receipt (manual review)',
        },
      });
    }
  }
);

/**
 * POST /api/v1/ai/qr-save
 * Instantly saves a scanned UPI or invoice QR directly to `public.transactions`.
 */
router.post(
  ['/ai/qr-save', '/qr-save'],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        res.status(400).json({ error: 'X-Workspace-Id header is required' });
        return;
      }

      const {
        amountRupees,
        merchantOrPayee = 'UPI Merchant',
        paymentMethod = 'UPI',
        source = 'QR_SCAN',
        note,
        categoryName = 'Chai & Dining',
      } = req.body;

      const rawAmount = parseFloat(String(amountRupees || 0));
      const amountPaise = rawAmount > 0 ? rupeesToPaise(rawAmount) : 100; // minimum 100 paise if not specified

      const categoryId = await resolveOrCreateCategory({
        db: req.db!,
        workspaceId,
        userId: req.userId!,
        categoryName,
        kind: 'EXPENSE',
      });

      const insertPayload: any = {
        workspace_id: workspaceId,
        user_id: req.userId!,
        category_id: categoryId,
        kind: 'EXPENSE',
        amount_paise: amountPaise,
        payment_via: paymentMethod,
        merchant_or_payee: merchantOrPayee.trim() || 'UPI Merchant',
        description: note || `Paid to ${merchantOrPayee} via UPI QR`,
        source_type: source,
      };

      let { data: tx, error: txErr } = await req.db!
        .from('transactions')
        .insert(insertPayload)
        .select('*')
        .single();

      if (txErr && txErr.message?.includes('source_type')) {
        delete insertPayload.source_type;
        const retry = await req.db!
          .from('transactions')
          .insert(insertPayload)
          .select('*')
          .single();
        tx = retry.data;
        txErr = retry.error;
      }

      if (txErr || !tx) {
        throw new Error(txErr?.message || 'Failed to save QR transaction');
      }

      res.status(201).json({
        success: true,
        transaction: tx,
        amountFormatted: formatINR(amountPaise),
        merchant: merchantOrPayee,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save QR transaction';
      res.status(400).json({ error: message });
    }
  }
);

export default router;

