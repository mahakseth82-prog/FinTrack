import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { formatINR } from '../utils/paise';

const router = Router();

export type ReminderLanguage = 'HINGLISH' | 'HINDI' | 'ENGLISH';
export type ReminderTone = 'FRIENDLY' | 'FORMAL';

/**
 * Generates culturally polite Indian payment reminder messages in Hinglish, Hindi, or English
 * using exact integer paise formatting.
 */
export function buildPoliteReminderMessage(params: {
  contactName: string;
  remainingPaise: number;
  principalPaise: number;
  repaidPaise: number;
  dueDate: string;
  titleOrNote: string;
  language: ReminderLanguage;
  tone: ReminderTone;
}): string {
  const remainingStr = formatINR(params.remainingPaise);
  const principalStr = formatINR(params.principalPaise);
  const repaidStr = formatINR(params.repaidPaise);
  const hasPartial = params.repaidPaise > 0;
  const notePart = params.titleOrNote ? ` (${params.titleOrNote})` : '';

  if (params.language === 'HINDI') {
    if (params.tone === 'FRIENDLY') {
      return `नमस्ते ${params.contactName} जी 🙏,\nFinTrack खाते के अनुसार आपका ${remainingStr} का बैलेंस${notePart} ${params.dueDate} को देय (due) है।${
        hasPartial
          ? ` (कुल: ${principalStr}, प्राप्त: ${repaidStr}, शेष: ${remainingStr})`
          : ''
      }\nजब भी आपको सुविधा हो, कृपया UPI या नकद द्वारा भुगतान कर दें। धन्यवाद! 🤝`;
    }
    return `आदरणीय ${params.contactName} जी 🙏,\nFinTrack व्यापार खाता अनुस्मारक: आपके खाते में ${remainingStr} की राशि${notePart} दिनांक ${params.dueDate} को देय है।${
      hasPartial
        ? ` (मूल राशि: ${principalStr}, जमा: ${repaidStr}, शेष: ${remainingStr})`
        : ''
    }\nकृपया समय पर भुगतान कर सहयोग प्रदान करें। सादर धन्यवाद।`;
  }

  if (params.language === 'ENGLISH') {
    if (params.tone === 'FRIENDLY') {
      return `Hello ${params.contactName} 🙏,\nJust a friendly reminder from FinTrack that your balance of ${remainingStr}${notePart} is due on ${params.dueDate}.${
        hasPartial
          ? ` (Total: ${principalStr}, Paid: ${repaidStr}, Remaining: ${remainingStr})`
          : ''
      }\nWhenever convenient, please share via UPI. Thank you!`;
    }
    return `Dear ${params.contactName},\nThis is a gentle reminder from FinTrack Ledger regarding your pending balance of ${remainingStr}${notePart}, due on ${params.dueDate}.${
      hasPartial
        ? ` (Principal: ${principalStr}, Received: ${repaidStr}, Balance: ${remainingStr})`
        : ''
    }\nKindly arrange the settlement at your earliest convenience. Thank you for your business.`;
  }

  // Default: HINGLISH
  if (params.tone === 'FRIENDLY') {
    return `Namaste ${params.contactName} bhai 🙏,\nFinTrack khate par aapka ${remainingStr} ka balance${notePart} ${params.dueDate} ko due hai.${
      hasPartial
        ? ` (Total: ${principalStr}, Mila: ${repaidStr}, Baaki: ${remainingStr})`
        : ''
    }\nJab aapko suvidha ho toh UPI ya cash kar dijiyega. Dhanyawad! 🤝`;
  }

  return `Namaste ${params.contactName} ji 🙏,\nFinTrack Vyapaar Khata reminder: Aapka ${remainingStr} ka hisaab${notePart} ${params.dueDate} ko due hai.${
    hasPartial
      ? ` (Original: ${principalStr}, Paid: ${repaidStr}, Remaining: ${remainingStr})`
      : ''
  }\nKripya samay par UPI ya bank transfer se payment bhej kar sahyog karein. Dhanyawad!`;
}

/**
 * GET /api/v1/reminders/due-soon
 * Returns all RECEIVABLE obligations due within the next 24 hours (or overdue)
 * so the user gets proactive 24-hour due alerts.
 */
router.get(
  '/reminders/due-soon',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        res.status(400).json({ error: 'X-Workspace-Id header is required' });
        return;
      }

      // Tomorrow's ISO date for 24-hour lookahead
      const tomorrowIso = new Date(Date.now() + 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
      const todayIso = new Date().toISOString().slice(0, 10);

      const { data: rows, error } = await req.db!
        .from('udhaar_obligations')
        .select(
          `
          id,
          contact_id,
          direction,
          principal_paise,
          repaid_paise,
          remaining_paise,
          status,
          due_date,
          title_or_note,
          contacts ( id, display_name, phone_number, kind )
        `
        )
        .eq('workspace_id', workspaceId)
        .eq('direction', 'RECEIVABLE')
        .neq('status', 'SETTLED')
        .lte('due_date', tomorrowIso)
        .order('due_date', { ascending: true });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      const alerts = (rows || []).map((ob) => {
        const contact = Array.isArray(ob.contacts) ? ob.contacts[0] : ob.contacts;
        const dueDate = ob.due_date || todayIso;
        const urgency =
          dueDate < todayIso
            ? 'OVERDUE'
            : dueDate === todayIso
              ? 'DUE_TODAY'
              : 'DUE_IN_24H';

        return {
          obligationId: ob.id,
          contactId: ob.contact_id,
          contactName: contact?.display_name || 'Customer',
          phoneNumber: contact?.phone_number || '',
          principalPaise: Number(ob.principal_paise),
          repaidPaise: Number(ob.repaid_paise),
          remainingPaise: Number(ob.remaining_paise),
          remainingFormatted: formatINR(Number(ob.remaining_paise)),
          dueDate,
          urgency,
          titleOrNote: ob.title_or_note || '',
        };
      });

      res.json({
        workspaceId,
        dueSoonCount: alerts.length,
        alerts,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch 24h due reminders';
      res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/v1/reminders/compose
 * Generates polite reminder messages in Hinglish, Hindi, and English for a given obligation.
 */
router.post(
  '/reminders/compose',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        obligationId,
        language = 'HINGLISH',
        tone = 'FRIENDLY',
      } = req.body;

      const { data: ob, error } = await req.db!
        .from('udhaar_obligations')
        .select(
          `
          id,
          contact_id,
          principal_paise,
          repaid_paise,
          remaining_paise,
          due_date,
          title_or_note,
          contacts ( id, display_name, phone_number )
        `
        )
        .eq('id', obligationId)
        .single();

      if (error || !ob) {
        res.status(404).json({ error: 'Obligation not found' });
        return;
      }

      const contact = Array.isArray(ob.contacts) ? ob.contacts[0] : ob.contacts;
      const contactName = contact?.display_name || 'Customer';
      const phoneNumber = contact?.phone_number || '';
      const dueDate =
        ob.due_date || new Date().toISOString().slice(0, 10);

      const message = buildPoliteReminderMessage({
        contactName,
        remainingPaise: Number(ob.remaining_paise),
        principalPaise: Number(ob.principal_paise),
        repaidPaise: Number(ob.repaid_paise),
        dueDate,
        titleOrNote: ob.title_or_note || '',
        language,
        tone,
      });

      res.json({
        obligationId: ob.id,
        contactId: ob.contact_id,
        contactName,
        phoneNumber,
        language,
        tone,
        message,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to compose reminder';
      res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/v1/reminders/log-sent
 * Records a sent WhatsApp/SMS reminder in `public.reminders` and `public.audit_logs`.
 */
router.post(
  '/reminders/log-sent',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        obligationId,
        contactId,
        channel = 'WHATSAPP',
        language = 'HINGLISH',
        composedMessage,
      } = req.body;

      if (!req.workspaceId) {
        res.status(400).json({ error: 'X-Workspace-Id header is required' });
        return;
      }

      const nowIso = new Date().toISOString();
      const { data: reminder, error } = await req.db!
        .from('reminders')
        .insert({
          workspace_id: req.workspaceId,
          user_id: req.userId!,
          obligation_id: obligationId,
          contact_id: contactId,
          channel,
          status: 'SENT',
          scheduled_for: nowIso,
          message_language: language,
          composed_message: composedMessage,
          sent_at: nowIso,
        })
        .select('*')
        .single();

      if (error || !reminder) {
        res
          .status(500)
          .json({ error: error?.message || 'Failed to log reminder' });
        return;
      }

      await req.db!.from('audit_logs').insert({
        workspace_id: req.workspaceId,
        user_id: req.userId!,
        entity_table: 'reminders',
        entity_id: reminder.id,
        action: 'POLITE_REMINDER_SENT',
        metadata: {
          obligationId,
          contactId,
          channel,
          language,
        },
      });

      res.status(201).json({ reminder });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to log sent reminder';
      res.status(500).json({ error: message });
    }
  }
);

export default router;
