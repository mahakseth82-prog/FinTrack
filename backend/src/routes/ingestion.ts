import { Router, Response } from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { extractBillWithGeminiVision } from '../services/geminiOcrService';
import { rupeesToPaise, paiseToRupees, formatINR } from '../utils/paise';

const router = Router();

/**
 * Deterministic UPI Notification Parser & Fingerprint Generator
 * Parses GPay, PhonePe, Paytm, BHIM, and Bank notification strings without SMS permissions.
 */
export function parseUpiNotificationPayload(params: {
  packageName: string;
  title: string;
  body: string;
  postedAtMs?: number;
}) {
  const combined = `${params.title} ${params.body}`.trim();

  // Extract Rupee amount (e.g., "₹180", "Rs. 1,250.50", "INR 500")
  const amountMatch = combined.match(
    /(?:₹|Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i
  );
  if (!amountMatch) {
    throw new Error('No valid INR amount found in notification text');
  }

  const amountPaise = rupeesToPaise(amountMatch[1]);

  // Detect direction: Received/Credited -> INCOME, Paid/Sent/Debited -> EXPENSE
  const isCredit = /\b(received|credited|got|deposited)\b/i.test(combined);
  const intent: 'EXPENSE' | 'INCOME' = isCredit ? 'INCOME' : 'EXPENSE';

  // Extract 12-digit UPI Reference / UTR number if present
  const utrMatch = combined.match(/\b(\d{12})\b/);
  const upiReferenceId = utrMatch ? utrMatch[1] : null;

  // Extract Merchant / Counterparty name after "to" or "from"
  const counterpartyMatch = combined.match(
    /\b(?:to|from)\s+([A-Za-z0-9\s.&'-]{2,35}?)(?:\s+(?:on|via|using|Ref|UTR|UPI|\.)|$)/i
  );
  const merchantName = counterpartyMatch
    ? counterpartyMatch[1].trim()
    : params.title.trim() || 'UPI Merchant';

  return {
    amountPaise,
    intent,
    upiReferenceId,
    merchantName,
    rawText: combined,
  };
}

export function buildUpiDedupeFingerprint(params: {
  workspaceId: string;
  amountPaise: number;
  upiReferenceId: string | null;
  merchantName: string;
  postedAtMs?: number;
}): string {
  if (params.upiReferenceId) {
    const rawKey = `${params.workspaceId}|UTR|${params.upiReferenceId}|${params.amountPaise}`;
    return crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 32);
  }

  const timestamp = params.postedAtMs || Date.now();
  const fiveMinBucket = Math.floor(timestamp / (5 * 60 * 1000));
  const normalizedMerchant = params.merchantName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 12);

  const rawKey = `${params.workspaceId}|BUCKET|${fiveMinBucket}|${params.amountPaise}|${normalizedMerchant}`;
  return crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 32);
}

function mapDraftRow(row: Record<string, any>) {
  const amountPaise =
    row.extracted_amount_paise !== null && row.extracted_amount_paise !== undefined
      ? Number(row.extracted_amount_paise)
      : null;

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    source: row.source,
    intent: row.intent,
    status: row.status,
    rawInputText: row.raw_input_text || '',
    extractedAmountPaise: amountPaise,
    extractedAmountRupees: amountPaise !== null ? paiseToRupees(amountPaise) : null,
    extractedAmountFormatted: amountPaise !== null ? formatINR(amountPaise) : null,
    extractedContactName: row.extracted_contact_name || null,
    matchedContactId: row.matched_contact_id || null,
    extractedCategoryName: row.extracted_category_name || null,
    extractedDueDate: row.extracted_due_date || null,
    paymentVia: row.payment_via || 'UPI',
    upiReferenceId: row.upi_reference_id || null,
    dedupeFingerprint: row.dedupe_fingerprint || null,
    ambiguityQuestion: row.ambiguity_question || null,
    aiConfidence: Number(row.ai_confidence || 0.9),
    description:
      (row.structured_payload && row.structured_payload.description) ||
      row.raw_input_text ||
      '',
    lineItems: (row.structured_payload && row.structured_payload.lineItems) || [],
    createdAt: row.created_at,
  };
}

/**
 * Helper to resolve or create a category in the workspace
 */
async function resolveOrCreateCategory(params: {
  db: any;
  workspaceId: string;
  userId: string;
  categoryName: string;
  kind: 'EXPENSE' | 'INCOME';
}): Promise<string | null> {
  const { db, workspaceId, userId, categoryName, kind } = params;
  const { data: cat } = await db
    .from('categories')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', categoryName)
    .eq('kind', kind)
    .maybeSingle();

  if (cat?.id) return cat.id;

  const { data: newCat } = await db
    .from('categories')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      name: categoryName,
      kind,
    })
    .select('id')
    .single();

  return newCat?.id || null;
}

/**
 * POST /api/v1/ingestion/bill-ocr and /api/v1/ai/parse-receipt
 * Scans a paper bill / parchi image with Gemini Vision, converts total to integer paise,
 * uploads receipt image to Supabase Storage (documents-vault), and saves to `public.transactions`.
 * Gracefully returns an editable draft if OCR cannot extract a definitive total.
 */
router.post(
  ['/ingestion/bill-ocr', '/ai/parse-receipt'],
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
        saveToVault,
        vaultTitle,
        vaultDocType = 'BILL',
        vaultExpiryDate,
      } = req.body;

      if (!imageBase64) {
        res.status(400).json({ error: 'imageBase64 is required for Bill OCR' });
        return;
      }

      // 1. Upload receipt image to Supabase Storage immediately
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
              .createSignedUrl(fileName, 86400 * 7); // 7-day signed URL
            if (signed?.signedUrl) {
              receiptImageUrl = signed.signedUrl;
            }
          } else {
            console.warn('Storage upload error:', uploadErr.message);
          }
        }
      } catch (storageErr) {
        console.warn('Receipt storage upload exception:', storageErr);
      }

      // 2. Perform OCR with Gemini Vision
      const { data: ws } = await req.db!
        .from('workspaces')
        .select('mode')
        .eq('id', workspaceId)
        .single();

      let ocrResult;
      try {
        ocrResult = await extractBillWithGeminiVision({
          imageBase64,
          mimeType,
          workspaceMode: ws?.mode || 'PERSONAL',
        });
      } catch (ocrErr) {
        console.warn('OCR error, using default fallback:', ocrErr);
        ocrResult = {
          merchantName: 'Scanned Bill',
          billDate: new Date().toISOString().slice(0, 10),
          totalRupees: null,
          suggestedCategory: 'Bills & Utilities',
          paymentVia: 'UNSPECIFIED' as const,
          lineItems: [],
          summaryNote: 'Scanned receipt',
          confidence: 0,
        };
      }

      const merchantName = ocrResult.merchantName || 'Scanned Bill';
      const categoryName = ocrResult.suggestedCategory || 'Grocery & Rashan';
      const detectedPayment = ocrResult.paymentVia;
      const validPayments = ['UPI', 'CARD', 'BANK_TRANSFER', 'CASH'];
      // Golden Rule: 'UNSPECIFIED' is mapped to 'OTHER' in database enum to satisfy PostgreSQL payment_channel constraint
      const paymentVia =
        detectedPayment && validPayments.includes(detectedPayment)
          ? detectedPayment
          : 'OTHER';

      const amountRupees = ocrResult.totalRupees;
      let tx: any = null;

      if (amountRupees && amountRupees > 0) {
        const amountPaise = rupeesToPaise(amountRupees);
        const categoryId = await resolveOrCreateCategory({
          db: req.db!,
          workspaceId,
          userId: req.userId!,
          categoryName,
          kind: 'EXPENSE',
        });

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
          console.warn('Full transaction insert failed, retrying with base payload:', insertRes.error.message);
          insertRes = await req.db!
            .from('transactions')
            .insert(basePayload)
            .select('*')
            .single();
          if (insertRes.error) {
            console.error('Base transaction insert also failed:', insertRes.error);
          }
        }

        tx = insertRes.data;
      } else {
        // Fallback: save to ingestion_drafts for manual review without hard 500 error
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

      // If requested, also store as a document in documents_vault
      let vaultDocId: string | null = null;
      if (saveToVault && receiptImagePath) {
        try {
          const { data: vaultDoc } = await req.db!
            .from('documents_vault')
            .insert({
              workspace_id: workspaceId,
              user_id: req.userId!,
              title: vaultTitle?.trim() || `${merchantName} Bill`,
              doc_type: vaultDocType,
              file_url: receiptImageUrl || '',
              file_path: receiptImagePath,
              expiry_date: vaultExpiryDate || null,
              linked_transaction_id: tx?.id || null,
              metadata: {
                totalRupees: ocrResult.totalRupees,
                merchantName,
                itemsCount: ocrResult.lineItems?.length || 0,
              },
            })
            .select('id')
            .single();

          vaultDocId = vaultDoc?.id || null;
        } catch (vaultErr) {
          console.warn('Failed to insert into documents_vault:', vaultErr);
        }
      }

      res.status(200).json({
        autoSaved: Boolean(tx),
        savedSummary: tx
          ? {
              id: tx.id,
              title: merchantName,
              amountPaise: tx.amount_paise,
              amountFormatted: formatINR(tx.amount_paise),
              categoryName,
              paymentVia,
              receiptImagePath,
              receiptImageUrl,
              vaultDocId,
            }
          : null,
        ocrSummary: ocrResult,
      });
    } catch (err: unknown) {
      console.warn('Receipt OCR handler notice:', err);
      res.status(200).json({
        autoSaved: false,
        savedSummary: null,
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
 * POST /api/v1/ingestion/upi-notification
 * Ingests an Android NotificationListenerService UPI alert (GPay, PhonePe, Paytm, Bank),
 * prevents duplicates via SHA-256 fingerprinting, and saves directly to `public.transactions`.
 */
router.post(
  '/ingestion/upi-notification',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        res.status(400).json({ error: 'X-Workspace-Id header is required' });
        return;
      }

      const {
        packageName = 'com.google.android.apps.nbu.paisa.user',
        title = '',
        body = '',
        postedAtMs,
      } = req.body;

      const parsed = parseUpiNotificationPayload({
        packageName,
        title,
        body,
        postedAtMs,
      });

      const fingerprint = buildUpiDedupeFingerprint({
        workspaceId,
        amountPaise: parsed.amountPaise,
        upiReferenceId: parsed.upiReferenceId,
        merchantName: parsed.merchantName,
        postedAtMs,
      });

      const { data: existingDraft } = await req.db!
        .from('ingestion_drafts')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('dedupe_fingerprint', fingerprint)
        .neq('status', 'DISMISSED')
        .maybeSingle();

      if (existingDraft) {
        res.status(200).json({
          duplicateSkipped: true,
          reason:
            'Duplicate UPI payment notification detected (matched fingerprint). Skipped.',
          fingerprint,
          draft: mapDraftRow(existingDraft),
        });
        return;
      }

      const categoryName =
        parsed.intent === 'INCOME' ? 'Salary & Income' : 'Grocery & Rashan';

      const { data: insertedDraft, error } = await req.db!
        .from('ingestion_drafts')
        .insert({
          workspace_id: workspaceId,
          user_id: req.userId!,
          source: 'UPI_NOTIFICATION',
          intent: parsed.intent,
          status: 'CONFIRMED',
          raw_input_text: parsed.rawText,
          extracted_amount_paise: parsed.amountPaise,
          extracted_contact_name: parsed.merchantName,
          extracted_category_name: categoryName,
          payment_via: 'UPI',
          upi_reference_id: parsed.upiReferenceId || fingerprint,
          dedupe_fingerprint: fingerprint,
          ai_confidence: 0.98,
          structured_payload: {
            packageName,
            description: `UPI ${parsed.intent === 'INCOME' ? 'Received from' : 'Paid to'} ${parsed.merchantName}`,
          },
        })
        .select('*')
        .single();

      if (error || !insertedDraft) {
        res
          .status(500)
          .json({ error: error?.message || 'Failed to record UPI notification' });
        return;
      }

      const categoryId = await resolveOrCreateCategory({
        db: req.db!,
        workspaceId,
        userId: req.userId!,
        categoryName,
        kind: parsed.intent,
      });

      await req.db!.from('transactions').insert({
        workspace_id: workspaceId,
        user_id: req.userId!,
        category_id: categoryId,
        kind: parsed.intent,
        amount_paise: parsed.amountPaise,
        payment_via: 'UPI',
        upi_reference_id: parsed.upiReferenceId || `NOTIF-${fingerprint.slice(0, 10)}`,
        merchant_or_payee: parsed.merchantName,
        description: parsed.rawText,
        source_draft_id: insertedDraft.id,
      });

      res.status(201).json({
        duplicateSkipped: false,
        autoSaved: true,
        fingerprint,
        draft: mapDraftRow(insertedDraft),
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to parse UPI notification';
      res.status(400).json({ error: message });
    }
  }
);

export default router;
