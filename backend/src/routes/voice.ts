import { Router, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import {
  parseVoiceOrTextWithGemini,
  cleanAndSanitizeScript,
  parseHindiSpokenAmount,
  LanguagePreference,
} from '../services/geminiVoiceService';
import {
  rupeesToPaise,
  paiseToRupees,
  formatINR,
  calculatePartialRepayment,
} from '../utils/paise';

const router = Router();

async function resolveUserLanguage(
  req: AuthenticatedRequest,
  explicitLang?: string
): Promise<LanguagePreference> {
  if (explicitLang === 'hi' || explicitLang === 'HINDI') return 'hi';
  if (explicitLang === 'en' || explicitLang === 'ENGLISH') return 'en';

  if (!req.db || !req.userId) return 'en';

  const { data } = await req.db
    .from('users_profile')
    .select('preferred_language')
    .eq('id', req.userId)
    .maybeSingle();

  if (data?.preferred_language === 'HINDI' || data?.preferred_language === 'hi') {
    return 'hi';
  }
  return 'en';
}

async function resolveWorkspace(
  req: AuthenticatedRequest
): Promise<{ id: string; mode: 'PERSONAL' | 'BUSINESS' }> {
  if (!req.db || !req.userId) {
    throw new Error('Unauthorized database session');
  }

  if (req.workspaceId) {
    const { data } = await req.db
      .from('workspaces')
      .select('id, mode')
      .eq('id', req.workspaceId)
      .single();
    if (data) {
      return { id: data.id, mode: data.mode };
    }
  }

  const { data, error } = await req.db
    .from('workspaces')
    .select('id, mode')
    .eq('user_id', req.userId)
    .order('mode', { ascending: true })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error('Workspace not found for user');
  }
  return { id: data.id, mode: data.mode };
}

function mapDraftRowToDto(row: Record<string, any>) {
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
    normalizedTitle:
      row.structured_payload?.normalized_title ||
      row.extracted_contact_name ||
      null,
    matchedContactId: row.matched_contact_id || null,
    extractedCategoryName: row.extracted_category_name || null,
    extractedDueDate: row.extracted_due_date || null,
    paymentVia: row.payment_via || 'UPI',
    ambiguityQuestion: row.ambiguity_question || null,
    aiConfidence: Number(row.ai_confidence || 0.9),
    description:
      (row.structured_payload && row.structured_payload.description) ||
      row.raw_input_text ||
      '',
    createdAt: row.created_at,
  };
}

/**
 * Shared deterministic ledger writer: saves a parsed voice/text draft directly
 * to `transactions` (Passbook) or `udhaar_obligations` + `udhaar_ledger_entries` (Udhaar Khata).
 * STRICT RULES:
 * 1. Forbid Urdu script on all fields.
 * 2. Preserve specific item spoken (e.g., "Clothes Purchase", "Milk & Bread", "Credit Given - Ravi").
 * 3. Never save generic placeholders like "Entry" or "Expense".
 */
async function commitDraftToLedger(params: {
  db: SupabaseClient;
  userId: string;
  draft: Record<string, any>;
  overrides?: {
    intent?: string;
    amountRupees?: string | number;
    title?: string;
    contactName?: string;
    categoryName?: string;
    dueDate?: string;
    paymentVia?: string;
    description?: string;
  };
  preferredLanguage?: LanguagePreference;
}): Promise<{
  entityTable: string;
  entityId: string;
  intent: string;
  title: string;
  amountPaise: number;
  amountFormatted: string;
  paymentVia: string;
  categoryName: string;
}> {
  const { db, userId, draft, overrides = {} } = params;

  // Resolve user language preference if not provided
  let prefLang = params.preferredLanguage;
  if (!prefLang) {
    const { data: userProf } = await db
      .from('users_profile')
      .select('preferred_language')
      .eq('id', userId)
      .maybeSingle();
    prefLang =
      userProf?.preferred_language === 'HINDI' || userProf?.preferred_language === 'hi'
        ? 'hi'
        : 'en';
  }

  const finalIntent = overrides.intent || draft.intent || 'EXPENSE';
  const finalAmountPaise = overrides.amountRupees
    ? rupeesToPaise(overrides.amountRupees)
    : Number(draft.extracted_amount_paise);

  if (!finalAmountPaise || finalAmountPaise <= 0) {
    throw new Error('Valid amount in Rupees is required');
  }

  // Derive specific title: Never generic "Entry" or "Expense"
  const rawTitle =
    overrides.title ||
    overrides.contactName ||
    draft.structured_payload?.normalized_title ||
    draft.normalized_title ||
    draft.extracted_contact_name ||
    draft.extracted_category_name ||
    (prefLang === 'hi' ? 'दैनिक खर्च' : 'Expense');

  let finalTitle = cleanAndSanitizeScript(rawTitle, prefLang);
  if (
    !finalTitle ||
    finalTitle.toLowerCase() === 'entry' ||
    finalTitle.toLowerCase() === 'expense' ||
    finalTitle.toLowerCase() === 'transaction'
  ) {
    finalTitle =
      cleanAndSanitizeScript(draft.extracted_category_name || '', prefLang) ||
      (prefLang === 'hi' ? 'दैनिक खर्च' : 'Daily Expense');
  }

  // Contact name for udhaar or merchant
  const rawContact =
    overrides.contactName ||
    draft.extracted_contact_name ||
    finalTitle;
  const finalContactName = cleanAndSanitizeScript(rawContact, prefLang);

  const finalCategoryName = cleanAndSanitizeScript(
    (overrides.categoryName ?? draft.extracted_category_name)?.trim() || 'General',
    prefLang
  );

  const finalDueDate =
    overrides.dueDate ||
    draft.extracted_due_date ||
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const finalPaymentVia = overrides.paymentVia || draft.payment_via || 'UPI';

  const rawDescription =
    overrides.description ||
    draft.structured_payload?.description ||
    draft.raw_input_text ||
    finalTitle;
  const finalDescription = cleanAndSanitizeScript(rawDescription, prefLang);

  let createdEntityTable = 'transactions';
  let createdEntityId = draft.id;

  // CASE A: Regular EXPENSE or INCOME -> Save to `transactions`
  if (finalIntent === 'EXPENSE' || finalIntent === 'INCOME') {
    let categoryId: string | null = null;
    const { data: cat } = await db
      .from('categories')
      .select('id')
      .eq('workspace_id', draft.workspace_id)
      .eq('name', finalCategoryName)
      .eq('kind', finalIntent)
      .maybeSingle();

    if (cat?.id) {
      categoryId = cat.id;
    } else {
      const { data: newCat } = await db
        .from('categories')
        .insert({
          workspace_id: draft.workspace_id,
          user_id: userId,
          name: finalCategoryName,
          kind: finalIntent,
        })
        .select('id')
        .single();
      categoryId = newCat?.id || null;
    }

    const { data: tx, error: txErr } = await db
      .from('transactions')
      .insert({
        workspace_id: draft.workspace_id,
        user_id: userId,
        category_id: categoryId,
        kind: finalIntent,
        amount_paise: finalAmountPaise,
        payment_via: finalPaymentVia,
        merchant_or_payee: finalTitle,
        description: finalDescription,
        source_draft_id: draft.id,
      })
      .select('id')
      .single();

    if (txErr || !tx) {
      throw new Error(txErr?.message || 'Failed to save transaction');
    }
    createdEntityTable = 'transactions';
    createdEntityId = tx.id;
  } else {
    // CASE B: UDHAAR_GAVE, UDHAAR_GOT, or UDHAAR_REPAYMENT -> Save to `udhaar_obligations`
    createdEntityTable = 'udhaar_obligations';

    let contactId: string | null = draft.matched_contact_id;
    if (!contactId) {
      const { data: foundContact } = await db
        .from('contacts')
        .select('id')
        .eq('workspace_id', draft.workspace_id)
        .ilike('display_name', finalContactName)
        .maybeSingle();

      if (foundContact?.id) {
        contactId = foundContact.id;
      } else {
        const { data: createdContact, error: cErr } = await db
          .from('contacts')
          .insert({
            workspace_id: draft.workspace_id,
            user_id: userId,
            display_name: finalContactName,
            kind: finalIntent === 'UDHAAR_GOT' ? 'SUPPLIER' : 'CUSTOMER',
            net_balance_paise: 0,
          })
          .select('id')
          .single();

        if (cErr || !createdContact) {
          throw new Error(cErr?.message || 'Failed to create contact');
        }
        contactId = createdContact.id;
      }
    }

    const { data: existingOb } = await db
      .from('udhaar_obligations')
      .select('*')
      .eq('workspace_id', draft.workspace_id)
      .eq('contact_id', contactId)
      .neq('status', 'SETTLED')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (finalIntent === 'UDHAAR_REPAYMENT' && existingOb) {
      const calc = calculatePartialRepayment(
        Number(existingOb.principal_paise),
        Number(existingOb.repaid_paise),
        finalAmountPaise
      );

      await db
        .from('udhaar_obligations')
        .update({
          repaid_paise: calc.newRepaidPaise,
          remaining_paise: calc.newRemainingPaise,
          status: calc.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingOb.id);

      await db.from('udhaar_ledger_entries').insert({
        obligation_id: existingOb.id,
        workspace_id: draft.workspace_id,
        user_id: userId,
        contact_id: contactId,
        entry_kind:
          existingOb.direction === 'RECEIVABLE'
            ? 'REPAYMENT_IN'
            : 'REPAYMENT_OUT',
        amount_paise: calc.paymentAppliedPaise,
        running_remaining_paise: calc.newRemainingPaise,
        payment_via: finalPaymentVia,
        note: finalDescription,
        source_draft_id: draft.id,
      });

      createdEntityId = existingOb.id;
    } else if (existingOb) {
      const newPrincipal =
        Number(existingOb.principal_paise) + finalAmountPaise;
      const newRemaining =
        Number(existingOb.remaining_paise) + finalAmountPaise;
      const newStatus =
        Number(existingOb.repaid_paise) > 0 ? 'PARTIALLY_PAID' : 'OPEN';

      await db
        .from('udhaar_obligations')
        .update({
          principal_paise: newPrincipal,
          remaining_paise: newRemaining,
          status: newStatus,
          due_date: finalDueDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingOb.id);

      await db.from('udhaar_ledger_entries').insert({
        obligation_id: existingOb.id,
        workspace_id: draft.workspace_id,
        user_id: userId,
        contact_id: contactId,
        entry_kind:
          finalIntent === 'UDHAAR_GOT' ? 'PRINCIPAL_GOT' : 'PRINCIPAL_GAVE',
        amount_paise: finalAmountPaise,
        running_remaining_paise: newRemaining,
        payment_via: finalPaymentVia,
        note: finalDescription,
        source_draft_id: draft.id,
      });

      createdEntityId = existingOb.id;
    } else {
      const direction =
        finalIntent === 'UDHAAR_GOT' ? 'PAYABLE' : 'RECEIVABLE';

      const { data: newOb, error: obErr } = await db
        .from('udhaar_obligations')
        .insert({
          workspace_id: draft.workspace_id,
          user_id: userId,
          contact_id: contactId,
          direction,
          principal_paise: finalAmountPaise,
          repaid_paise: 0,
          remaining_paise: finalAmountPaise,
          status: 'OPEN',
          due_date: finalDueDate,
          title_or_note: finalTitle,
        })
        .select('id')
        .single();

      if (obErr || !newOb) {
        throw new Error(obErr?.message || 'Failed to create obligation');
      }

      await db.from('udhaar_ledger_entries').insert({
        obligation_id: newOb.id,
        workspace_id: draft.workspace_id,
        user_id: userId,
        contact_id: contactId,
        entry_kind:
          direction === 'RECEIVABLE' ? 'PRINCIPAL_GAVE' : 'PRINCIPAL_GOT',
        amount_paise: finalAmountPaise,
        running_remaining_paise: finalAmountPaise,
        payment_via: finalPaymentVia,
        note: finalDescription,
        source_draft_id: draft.id,
      });

      createdEntityId = newOb.id;
    }
  }

  // Mark draft as CONFIRMED
  await db
    .from('ingestion_drafts')
    .update({
      status: 'CONFIRMED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', draft.id);

  // Write Audit Log
  await db.from('audit_logs').insert({
    workspace_id: draft.workspace_id,
    user_id: userId,
    entity_table: createdEntityTable,
    entity_id: createdEntityId,
    action: 'VOICE_AUTO_SAVED',
    metadata: {
      draftId: draft.id,
      intent: finalIntent,
      amountPaise: finalAmountPaise,
      title: finalTitle,
    },
  });

  return {
    entityTable: createdEntityTable,
    entityId: createdEntityId,
    intent: finalIntent,
    title: finalTitle,
    amountPaise: finalAmountPaise,
    amountFormatted: formatINR(finalAmountPaise),
    paymentVia: finalPaymentVia,
    categoryName: finalCategoryName,
  };
}

/**
 * GET /api/v1/drafts
 * Lists all pending or clarification-needed drafts in the active workspace.
 */
router.get('/drafts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ws = await resolveWorkspace(req);
    const { data, error } = await req.db!
      .from('ingestion_drafts')
      .select('*')
      .eq('workspace_id', ws.id)
      .in('status', ['PENDING_CONFIRMATION', 'NEEDS_CLARIFICATION'])
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({
      workspaceId: ws.id,
      drafts: (data || []).map(mapDraftRowToDto),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load drafts';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/v1/voice/parse
 * Parses Hindi/Hinglish/English audio or spoken text using Groq Whisper + LLM + Gemini AI,
 * strictly enforces user's preferred language, strictly bans Urdu script, and
 * preserves specific spoken items.
 */
router.post(
  '/voice/parse',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ws = await resolveWorkspace(req);
      const userLang = await resolveUserLanguage(req, req.body.preferredLanguage);
      const { utteranceText, audioBase64, audioMimeType, autoSave = true } = req.body;

      if (!utteranceText && !audioBase64) {
        res
          .status(400)
          .json({
            error:
              userLang === 'hi'
                ? 'कृपया कुछ बोलें या लिखें (e.g. "पेट्रोल 300" या "कपड़े 1200")'
                : 'Kripya kuch bolein ya likhein (e.g. "Petrol 300" or "Clothes 1200")',
          });
        return;
      }

      const todayIsoDate = new Date().toISOString().slice(0, 10);
      const extracted = await parseVoiceOrTextWithGemini({
        utteranceText,
        audioBase64,
        audioMimeType,
        workspaceMode: ws.mode,
        preferredLanguage: userLang,
        todayIsoDate,
      });

      const finalRupees =
        (extracted.extractedRupees && extracted.extractedRupees > 0)
          ? extracted.extractedRupees
          : parseHindiSpokenAmount(extracted.transcript || utteranceText || '');

      const extractedAmountPaise =
        finalRupees && finalRupees > 0
          ? rupeesToPaise(finalRupees)
          : null;

      let matchedContactId: string | null = null;
      if (extracted.extractedContactName) {
        const { data: matchedContacts } = await req.db!
          .from('contacts')
          .select('id, display_name')
          .eq('workspace_id', ws.id)
          .ilike('display_name', `%${extracted.extractedContactName}%`)
          .limit(1);

        if (matchedContacts && matchedContacts.length > 0) {
          matchedContactId = matchedContacts[0].id;
        }
      }

      const needsClarification = extractedAmountPaise === null;
      const ambiguityQuestion = needsClarification
        ? userLang === 'hi'
          ? 'कितने रुपये की एंट्री है? (e.g. "पेट्रोल 300" या "रवि को 500 उधार")'
          : 'Kitne rupaye ki entry hai? (e.g. "Petrol 300" ya "Ravi ko 500 udhaar")'
        : null;

      const status = needsClarification
        ? 'NEEDS_CLARIFICATION'
        : 'PENDING_CONFIRMATION';

      const { data: insertedDraft, error } = await req.db!
        .from('ingestion_drafts')
        .insert({
          workspace_id: ws.id,
          user_id: req.userId!,
          source: 'VOICE',
          intent: extracted.intent,
          status,
          raw_input_text: extracted.transcript || utteranceText || '',
          extracted_amount_paise: extractedAmountPaise,
          extracted_contact_name: extracted.extractedContactName,
          matched_contact_id: matchedContactId,
          extracted_category_name: extracted.extractedCategoryName,
          extracted_due_date: extracted.extractedDueDate,
          payment_via: extracted.paymentVia || 'UPI',
          ambiguity_question: ambiguityQuestion,
          ai_confidence: extracted.confidence ?? 0.95,
          structured_payload: {
            description: extracted.description,
            normalized_title: extracted.normalized_title,
            preferredLanguage: userLang,
          },
        })
        .select('*')
        .single();

      if (error || !insertedDraft) {
        res
          .status(500)
          .json({ error: error?.message || 'Failed to save voice entry' });
        return;
      }

      // AUTOMATIC SAVE: Whenever we have a valid amount and autoSave !== false,
      // save directly to `transactions` or `udhaar_obligations` immediately!
      if (autoSave !== false && extractedAmountPaise && extractedAmountPaise > 0) {
        const savedInfo = await commitDraftToLedger({
          db: req.db!,
          userId: req.userId!,
          draft: insertedDraft,
          preferredLanguage: userLang,
        });

        res.status(201).json({
          autoSaved: true,
          savedSummary: savedInfo,
          draft: {
            ...mapDraftRowToDto(insertedDraft),
            status: 'CONFIRMED',
          },
        });
        return;
      }

      res.status(201).json({
        autoSaved: false,
        draft: mapDraftRowToDto(insertedDraft),
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Voice AI extraction failed';
      res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/v1/drafts/:draftId/clarify
 * Resolves an ambiguity follow-up question on an existing draft and auto-saves once amount is known.
 */
router.post(
  '/drafts/:draftId/clarify',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { draftId } = req.params;
      const { clarificationAnswer, audioBase64, audioMimeType } = req.body;
      const ws = await resolveWorkspace(req);
      const userLang = await resolveUserLanguage(req, req.body.preferredLanguage);

      const { data: existingDraft, error: fErr } = await req.db!
        .from('ingestion_drafts')
        .select('*')
        .eq('id', draftId)
        .single();

      if (fErr || !existingDraft) {
        res.status(404).json({ error: 'Draft not found' });
        return;
      }

      const combinedText = `${existingDraft.raw_input_text || ''} ${clarificationAnswer || ''}`.trim();
      const todayIsoDate = new Date().toISOString().slice(0, 10);
      const resolved = await parseVoiceOrTextWithGemini({
        utteranceText: combinedText,
        audioBase64,
        audioMimeType,
        workspaceMode: ws.mode,
        preferredLanguage: userLang,
        previousDraftContext: JSON.stringify({
          rawInputText: existingDraft.raw_input_text,
          intent: existingDraft.intent,
          extractedAmountPaise: existingDraft.extracted_amount_paise,
          extractedContactName: existingDraft.extracted_contact_name,
        }),
        clarificationAnswer,
        todayIsoDate,
      });

      const amountPaise =
        resolved.extractedRupees && resolved.extractedRupees > 0
          ? rupeesToPaise(resolved.extractedRupees)
          : existingDraft.extracted_amount_paise;

      const stillNeedsClarification = !amountPaise || amountPaise <= 0;

      const { data: updatedDraft, error: uErr } = await req.db!
        .from('ingestion_drafts')
        .update({
          intent: resolved.intent,
          status: stillNeedsClarification
            ? 'NEEDS_CLARIFICATION'
            : 'PENDING_CONFIRMATION',
          extracted_amount_paise: amountPaise,
          extracted_contact_name:
            resolved.extractedContactName || existingDraft.extracted_contact_name,
          extracted_category_name:
            resolved.extractedCategoryName ||
            existingDraft.extracted_category_name,
          extracted_due_date:
            resolved.extractedDueDate || existingDraft.extracted_due_date,
          payment_via: resolved.paymentVia || existingDraft.payment_via,
          ambiguity_question: stillNeedsClarification
            ? resolved.ambiguityQuestion
            : null,
          structured_payload: {
            description: resolved.description,
            normalized_title: resolved.normalized_title,
            clarificationAnswer,
            preferredLanguage: userLang,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', draftId)
        .select('*')
        .single();

      if (uErr || !updatedDraft) {
        res
          .status(500)
          .json({ error: uErr?.message || 'Failed to update clarified draft' });
        return;
      }

      if (!stillNeedsClarification) {
        const savedInfo = await commitDraftToLedger({
          db: req.db!,
          userId: req.userId!,
          draft: updatedDraft,
          preferredLanguage: userLang,
        });

        res.json({
          autoSaved: true,
          savedSummary: savedInfo,
          draft: {
            ...mapDraftRowToDto(updatedDraft),
            status: 'CONFIRMED',
          },
        });
        return;
      }

      res.json({
        autoSaved: false,
        draft: mapDraftRowToDto(updatedDraft),
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to clarify voice draft';
      res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/v1/drafts/:draftId/confirm
 */
router.post(
  '/drafts/:draftId/confirm',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { draftId } = req.params;
      const userLang = await resolveUserLanguage(req, req.body.preferredLanguage);

      const { data: draft, error: dErr } = await req.db!
        .from('ingestion_drafts')
        .select('*')
        .eq('id', draftId)
        .single();

      if (dErr || !draft) {
        res.status(404).json({ error: 'Draft not found' });
        return;
      }

      if (draft.status === 'CONFIRMED') {
        res.status(400).json({ error: 'Draft has already been confirmed' });
        return;
      }

      const savedInfo = await commitDraftToLedger({
        db: req.db!,
        userId: req.userId!,
        draft,
        preferredLanguage: userLang,
        overrides: {
          intent: req.body.intent,
          amountRupees: req.body.amountRupees,
          title: req.body.title,
          contactName: req.body.contactName,
          categoryName: req.body.categoryName,
          dueDate: req.body.dueDate,
          paymentVia: req.body.paymentVia,
          description: req.body.description,
        },
      });

      res.json({
        confirmed: true,
        entityTable: savedInfo.entityTable,
        entityId: savedInfo.entityId,
        savedSummary: savedInfo,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to confirm draft';
      res.status(400).json({ error: message });
    }
  }
);

/**
 * POST /api/v1/drafts/:draftId/dismiss
 */
router.post(
  '/drafts/:draftId/dismiss',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { draftId } = req.params;
      const { error } = await req.db!
        .from('ingestion_drafts')
        .update({ status: 'DISMISSED', updated_at: new Date().toISOString() })
        .eq('id', draftId);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({ dismissed: true });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to dismiss draft';
      res.status(500).json({ error: message });
    }
  }
);

export default router;
