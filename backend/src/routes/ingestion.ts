import { Router, Response } from 'express';
import crypto from 'crypto';
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
  // If 12-digit UPI Reference ID is present, deduplicate strictly on workspace + amount + UTR
  if (params.upiReferenceId) {
    const rawKey = `${params.workspaceId}|UTR|${params.upiReferenceId}|${params.amountPaise}`;
    return crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 32);
  }

  // Otherwise bucket into 5-minute windows + amountPaise + normalized tokens
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
 * POST /api/v1/ingestion/bill-ocr
 * Scans a paper bill / parchi image with Gemini Vision, converts total to integer paise,
 * and saves a `BILL_OCR` draft in `public.ingestion_drafts`.
 */
router.post(
  '/ingestion/bill-ocr',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        res.status(400).json({ error: 'X-Workspace-Id header is required' });
        return;
      }

      const { imageBase64, mimeType = 'image/jpeg' } = req.body;
      if (!imageBase64) {
        res.status(400).json({ error: 'imageBase64 is required for Bill OCR' });
        return;
      }

      const { data: ws } = await req.db!
        .from('workspaces')
        .select('mode')
        .eq('id', workspaceId)
        .single();

      const ocrResult = await extractBillWithGeminiVision({
        imageBase64,
        mimeType,
        workspaceMode: ws?.mode || 'PERSONAL',
      });

      const amountPaise =
        ocrResult.totalRupees && ocrResult.totalRupees > 0
          ? rupeesToPaise(ocrResult.totalRupees)
          : null;

      const needsClarification = amountPaise === null;

      const { data: inserted, error } = await req.db!
        .from('ingestion_drafts')
        .insert({
          workspace_id: workspaceId,
          user_id: req.userId!,
          source: 'BILL_OCR',
          intent: 'EXPENSE',
          status: needsClarification
            ? 'NEEDS_CLARIFICATION'
            : 'PENDING_CONFIRMATION',
          raw_input_text: `Bill from ${ocrResult.merchantName}: ${ocrResult.summaryNote}`,
          extracted_amount_paise: amountPaise,
          extracted_contact_name: ocrResult.merchantName,
          extracted_category_name: ocrResult.suggestedCategory,
          payment_via: ocrResult.paymentVia || 'CASH',
          ambiguity_question: needsClarification
            ? 'Bill par total amount saaf nahi dikh raha. Kitne rupaye ka bill hai?'
            : null,
          ai_confidence: ocrResult.confidence ?? 0.9,
          structured_payload: {
            description: ocrResult.summaryNote,
            billDate: ocrResult.billDate,
            lineItems: ocrResult.lineItems,
          },
        })
        .select('*')
        .single();

      if (error || !inserted) {
        res
          .status(500)
          .json({ error: error?.message || 'Failed to save Bill OCR draft' });
        return;
      }

      res.status(201).json({
        draft: mapDraftRow(inserted),
        ocrSummary: ocrResult,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Bill OCR extraction failed';
      res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/v1/ingestion/upi-notification
 * Ingests an Android NotificationListenerService UPI alert (GPay, PhonePe, Paytm, Bank)
 * and prevents duplicate drafts using deterministic SHA-256 fingerprinting.
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

      // Check if an identical payment draft already exists (e.g. GPay + Bank notification for same payment)
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
            'Duplicate UPI payment notification detected (matched fingerprint). Skipped creating second draft.',
          fingerprint,
          draft: mapDraftRow(existingDraft),
        });
        return;
      }

      const { data: inserted, error } = await req.db!
        .from('ingestion_drafts')
        .insert({
          workspace_id: workspaceId,
          user_id: req.userId!,
          source: 'UPI_NOTIFICATION',
          intent: parsed.intent,
          status: 'PENDING_CONFIRMATION',
          raw_input_text: parsed.rawText,
          extracted_amount_paise: parsed.amountPaise,
          extracted_contact_name: parsed.merchantName,
          extracted_category_name:
            parsed.intent === 'INCOME' ? 'Salary & Income' : 'Grocery & Rashan',
          payment_via: 'UPI',
          upi_reference_id: parsed.upiReferenceId,
          dedupe_fingerprint: fingerprint,
          ai_confidence: 0.98,
          structured_payload: {
            packageName,
            description: `UPI ${parsed.intent === 'INCOME' ? 'Received from' : 'Paid to'} ${parsed.merchantName}`,
          },
        })
        .select('*')
        .single();

      if (error || !inserted) {
        res
          .status(500)
          .json({ error: error?.message || 'Failed to stage UPI draft' });
        return;
      }

      res.status(201).json({
        duplicateSkipped: false,
        fingerprint,
        draft: mapDraftRow(inserted),
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to parse UPI notification';
      res.status(400).json({ error: message });
    }
  }
);

export default router;

