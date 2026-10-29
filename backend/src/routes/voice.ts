import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { parseVoiceOrTextWithGemini } from '../services/geminiVoiceService';
import {
  rupeesToPaise,
  paiseToRupees,
  formatINR,
  calculatePartialRepayment,
} from '../utils/paise';

const router = Router();

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
      .in('status', ['NEEDS_CLARIFICATION', 'PENDING_CONFIRMATION'])
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
 * Parses Hindi/Hinglish/English audio or spoken text using Gemini AI,
 * computes integer paise deterministically in code, and stages a row in `ingestion_drafts`.
 */
router.post(
  '/voice/parse',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ws = await resolveWorkspace(req);
      const { utteranceText, audioBase64, audioMimeType } = req.body;

      if (!utteranceText && !audioBase64) {
        res
          .status(400)
          .json({ error: 'Please provide either utteranceText or audioBase64.' });
        return;
      }

      const todayIsoDate = new Date().toISOString().slice(0, 10);
      const extracted = await parseVoiceOrTextWithGemini({
        utteranceText,
        audioBase64,
        audioMimeType,
        workspaceMode: ws.mode,
        todayIsoDate,
      });

      // Deterministic integer paise conversion (Rule #1 & Rule #2)
      const extractedAmountPaise =
        extracted.extractedRupees && extracted.extractedRupees > 0
          ? rupeesToPaise(extracted.extractedRupees)
          : null;

      // Try matching contact in current workspace if contact name was extracted
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

      const needsClarification =
        extracted.needsClarification || extractedAmountPaise === null;

      const ambiguityQuestion = needsClarification
        ? extracted.ambiguityQuestion ||
          'Kitne rupaye ki entry hai aur kya yeh Kharcha hai ya Udhaar?'
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
          ai_confidence: extracted.confidence ?? 0.9,
          structured_payload: {
            description: extracted.description,
          },
        })
        .select('*')
        .single();

      if (error || !insertedDraft) {
        res
          .status(500)
          .json({ error: error?.message || 'Failed to save voice draft' });
        return;
      }

      res.status(201).json({
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
 * Resolves an ambiguity follow-up question on an existing draft.
 */
router.post(
  '/drafts/:draftId/clarify',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { draftId } = req.params;
      const { clarificationAnswer, audioBase64, audioMimeType } = req.body;
      const ws = await resolveWorkspace(req);

      const { data: existingDraft, error: fErr } = await req.db!
        .from('ingestion_drafts')
        .select('*')
        .eq('id', draftId)
        .single();

      if (fErr || !existingDraft) {
        res.status(404).json({ error: 'Draft not found' });
        return;
      }

      const todayIsoDate = new Date().toISOString().slice(0, 10);
      const resolved = await parseVoiceOrTextWithGemini({
        utteranceText: existingDraft.raw_input_text,
        audioBase64,
        audioMimeType,
        workspaceMode: ws.mode,
        previousDraftContext: JSON.stringify({
          rawInputText: existingDraft.raw_input_text,
          intent: existingDraft.intent,
          extractedAmountPaise: existingDraft.extracted_amount_paise,
          extractedContactName: existingDraft.extracted_contact_name,
          questionAsked: existingDraft.ambiguity_question,
        }),
        clarificationAnswer,
        todayIsoDate,
      });

      const amountPaise =
        resolved.extractedRupees && resolved.extractedRupees > 0
          ? rupeesToPaise(resolved.extractedRupees)
          : existingDraft.extracted_amount_paise;

      const stillNeedsClarification =
        resolved.needsClarification || !amountPaise;

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
            clarificationAnswer,
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

      res.json({
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
 * Golden Rule #1: Only when the user taps [ Confirm & Save ], deterministic code
 * calculates integer paise and commits the draft to `transactions` or `udhaar_obligations`.
 */
router.post(
  '/drafts/:draftId/confirm',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { draftId } = req.params;

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

      // Allow user's final edits from the Draft Confirmation Card
      const finalIntent = req.body.intent || draft.intent;
      const finalAmountPaise = req.body.amountRupees
        ? rupeesToPaise(req.body.amountRupees)
        : Number(draft.extracted_amount_paise);

      if (!finalAmountPaise || finalAmountPaise <= 0) {
        res.status(400).json({ error: 'Valid amount is required to confirm draft' });
        return;
      }

      const finalContactName =
        req.body.contactName ?? draft.extracted_contact_name ?? 'Customer';
      const finalCategoryName =
        req.body.categoryName ?? draft.extracted_category_name ?? 'General';
      const finalDueDate =
        req.body.dueDate ??
        draft.extracted_due_date ??
        new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const finalPaymentVia = req.body.paymentVia || draft.payment_via || 'UPI';
      const finalDescription =
        req.body.description ||
        draft.structured_payload?.description ||
        draft.raw_input_text ||
        'Voice Entry';

      let createdEntityTable = 'transactions';
      let createdEntityId = draft.id;

      // CASE A: Regular EXPENSE or INCOME
      if (finalIntent === 'EXPENSE' || finalIntent === 'INCOME') {
        let categoryId: string | null = null;
        const { data: cat } = await req.db!
          .from('categories')
          .select('id')
          .eq('workspace_id', draft.workspace_id)
          .eq('name', finalCategoryName)
          .eq('kind', finalIntent)
          .maybeSingle();

        if (cat?.id) {
          categoryId = cat.id;
        } else {
          const { data: newCat } = await req.db!
            .from('categories')
            .insert({
              workspace_id: draft.workspace_id,
              user_id: req.userId!,
              name: finalCategoryName,
              kind: finalIntent,
            })
            .select('id')
            .single();
          categoryId = newCat?.id || null;
        }

        const { data: tx, error: txErr } = await req.db!
          .from('transactions')
          .insert({
            workspace_id: draft.workspace_id,
            user_id: req.userId!,
            category_id: categoryId,
            kind: finalIntent,
            amount_paise: finalAmountPaise,
            payment_via: finalPaymentVia,
            merchant_or_payee: finalContactName || finalCategoryName,
            description: finalDescription,
            source_draft_id: draft.id,
          })
          .select('id')
          .single();

        if (txErr || !tx) {
          res
            .status(500)
            .json({ error: txErr?.message || 'Failed to save transaction' });
          return;
        }
        createdEntityTable = 'transactions';
        createdEntityId = tx.id;
      } else {
        // CASE B: UDHAAR_GAVE, UDHAAR_GOT, or UDHAAR_REPAYMENT
        createdEntityTable = 'udhaar_obligations';

        // 1. Find or create contact in workspace
        let contactId: string | null = draft.matched_contact_id;
        if (!contactId) {
          const { data: foundContact } = await req.db!
            .from('contacts')
            .select('id')
            .eq('workspace_id', draft.workspace_id)
            .ilike('display_name', finalContactName)
            .maybeSingle();

          if (foundContact?.id) {
            contactId = foundContact.id;
          } else {
            const { data: createdContact, error: cErr } = await req.db!
              .from('contacts')
              .insert({
                workspace_id: draft.workspace_id,
                user_id: req.userId!,
                display_name: finalContactName,
                kind: finalIntent === 'UDHAAR_GOT' ? 'SUPPLIER' : 'CUSTOMER',
                net_balance_paise: 0,
              })
              .select('id')
              .single();

            if (cErr || !createdContact) {
              res
                .status(500)
                .json({ error: cErr?.message || 'Failed to create contact' });
              return;
            }
            contactId = createdContact.id;
          }
        }

        // Check if an active obligation already exists for this contact
        const { data: existingOb } = await req.db!
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

          await req.db!
            .from('udhaar_obligations')
            .update({
              repaid_paise: calc.newRepaidPaise,
              remaining_paise: calc.newRemainingPaise,
              status: calc.status,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingOb.id);

          await req.db!.from('udhaar_ledger_entries').insert({
            obligation_id: existingOb.id,
            workspace_id: draft.workspace_id,
            user_id: req.userId!,
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
          // Add to existing principal udhaar
          const newPrincipal =
            Number(existingOb.principal_paise) + finalAmountPaise;
          const newRemaining =
            Number(existingOb.remaining_paise) + finalAmountPaise;
          const newStatus =
            Number(existingOb.repaid_paise) > 0 ? 'PARTIALLY_PAID' : 'OPEN';

          await req.db!
            .from('udhaar_obligations')
            .update({
              principal_paise: newPrincipal,
              remaining_paise: newRemaining,
              status: newStatus,
              due_date: finalDueDate,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingOb.id);

          await req.db!.from('udhaar_ledger_entries').insert({
            obligation_id: existingOb.id,
            workspace_id: draft.workspace_id,
            user_id: req.userId!,
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
          // Create brand new obligation
          const direction =
            finalIntent === 'UDHAAR_GOT' ? 'PAYABLE' : 'RECEIVABLE';

          const { data: newOb, error: obErr } = await req.db!
            .from('udhaar_obligations')
            .insert({
              workspace_id: draft.workspace_id,
              user_id: req.userId!,
              contact_id: contactId,
              direction,
              principal_paise: finalAmountPaise,
              repaid_paise: 0,
              remaining_paise: finalAmountPaise,
              status: 'OPEN',
              due_date: finalDueDate,
              title_or_note: finalDescription,
            })
            .select('id')
            .single();

          if (obErr || !newOb) {
            res
              .status(500)
              .json({ error: obErr?.message || 'Failed to create obligation' });
            return;
          }

          await req.db!.from('udhaar_ledger_entries').insert({
            obligation_id: newOb.id,
            workspace_id: draft.workspace_id,
            user_id: req.userId!,
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
      await req.db!
        .from('ingestion_drafts')
        .update({
          status: 'CONFIRMED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', draft.id);

      // Write Audit Log
      await req.db!.from('audit_logs').insert({
        workspace_id: draft.workspace_id,
        user_id: req.userId!,
        entity_table: createdEntityTable,
        entity_id: createdEntityId,
        action: 'VOICE_DRAFT_CONFIRMED',
        metadata: {
          draftId: draft.id,
          intent: finalIntent,
          amountPaise: finalAmountPaise,
        },
      });

      res.json({
        confirmed: true,
        entityTable: createdEntityTable,
        entityId: createdEntityId,
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
 * Dismisses a draft without saving it to the ledger.
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
