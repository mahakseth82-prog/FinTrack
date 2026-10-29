import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import {
  rupeesToPaise,
  formatINR,
  calculatePartialRepayment,
} from '../utils/paise';

const router = Router();

/**
 * Helper to resolve the active workspace ID from X-Workspace-Id header or mode query.
 */
async function resolveWorkspaceId(
  req: AuthenticatedRequest,
  fallbackMode: 'PERSONAL' | 'BUSINESS' = 'PERSONAL'
): Promise<string> {
  if (req.workspaceId) {
    return req.workspaceId;
  }
  if (!req.db || !req.userId) {
    throw new Error('Database client or user session missing');
  }
  const { data, error } = await req.db
    .from('workspaces')
    .select('id')
    .eq('user_id', req.userId)
    .eq('mode', fallbackMode)
    .single();

  if (error || !data) {
    throw new Error(`Workspace for mode ${fallbackMode} not found in Supabase`);
  }
  return data.id;
}

/**
 * GET /api/v1/workspaces
 * Fetches the authenticated user's PERSONAL and BUSINESS workspaces from Supabase.
 */
router.get('/workspaces', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: workspaces, error } = await req.db!
      .from('workspaces')
      .select('id, mode, display_name, theme_primary_hex, currency_code')
      .eq('user_id', req.userId!)
      .order('mode', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ workspaces: workspaces || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch workspaces';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/v1/dashboard/summary
 * Fetches live Personal/Business dashboard metrics, recent transactions,
 * personal udhaar totals, and pending UPI notification draft count from Supabase.
 */
router.get(
  '/dashboard/summary',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceId = await resolveWorkspaceId(req, 'PERSONAL');

      // 1. Fetch transactions for this workspace
      const { data: txRows, error: txErr } = await req.db!
        .from('transactions')
        .select(
          `
          id,
          kind,
          amount_paise,
          payment_via,
          merchant_or_payee,
          description,
          occurred_at,
          categories ( id, name, icon_name, color_hex )
        `
        )
        .eq('workspace_id', workspaceId)
        .order('occurred_at', { ascending: false })
        .limit(50);

      if (txErr) {
        res.status(500).json({ error: txErr.message });
        return;
      }

      const transactions = txRows || [];
      const totalSpentPaise = transactions
        .filter((t) => t.kind === 'EXPENSE')
        .reduce((sum, t) => sum + Number(t.amount_paise), 0);

      const totalIncomePaise = transactions
        .filter((t) => t.kind === 'INCOME')
        .reduce((sum, t) => sum + Number(t.amount_paise), 0);

      // 2. Fetch udhaar obligations in this workspace
      const { data: obRows, error: obErr } = await req.db!
        .from('udhaar_obligations')
        .select('direction, remaining_paise, status')
        .eq('workspace_id', workspaceId)
        .neq('status', 'SETTLED');

      if (obErr) {
        res.status(500).json({ error: obErr.message });
        return;
      }

      const obligations = obRows || [];
      const totalReceivablePaise = obligations
        .filter((o) => o.direction === 'RECEIVABLE')
        .reduce((sum, o) => sum + Number(o.remaining_paise), 0);

      const totalPayablePaise = obligations
        .filter((o) => o.direction === 'PAYABLE')
        .reduce((sum, o) => sum + Number(o.remaining_paise), 0);

      // 3. Fetch pending UPI notification drafts count
      const { count: detectedUpiCount } = await req.db!
        .from('ingestion_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('status', 'PENDING_CONFIRMATION');

      res.json({
        workspaceId,
        totalSpentPaise,
        totalIncomePaise,
        netBalancePaise: totalIncomePaise - totalSpentPaise,
        totalReceivablePaise,
        totalPayablePaise,
        detectedUpiCount: detectedUpiCount || 0,
        recentTransactions: transactions.map((t) => {
          const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories;
          return {
            id: t.id,
            kind: t.kind,
            amountPaise: Number(t.amount_paise),
            paymentVia: t.payment_via,
            merchantOrPayee: t.merchant_or_payee || cat?.name || 'Transaction',
            description: t.description || '',
            categoryName: cat?.name || 'General',
            categoryIcon: cat?.icon_name || 'receipt-outline',
            occurredAt: t.occurred_at,
          };
        }),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Dashboard summary error';
      res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/v1/budgets
 * Fetches monthly category budgets and calculates live spentPaise from transactions.
 */
router.get('/budgets', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = await resolveWorkspaceId(req, 'PERSONAL');
    const monthYear =
      (req.query.monthYear as string) || new Date().toISOString().slice(0, 7);

    const { data: budgetRows, error: bErr } = await req.db!
      .from('budgets')
      .select(
        `
        id,
        category_id,
        month_year,
        limit_paise,
        alert_threshold_percent,
        categories ( id, name, icon_name, color_hex )
      `
      )
      .eq('workspace_id', workspaceId)
      .eq('month_year', monthYear);

    if (bErr) {
      res.status(500).json({ error: bErr.message });
      return;
    }

    const { data: expenseRows, error: eErr } = await req.db!
      .from('transactions')
      .select('category_id, amount_paise')
      .eq('workspace_id', workspaceId)
      .eq('kind', 'EXPENSE');

    if (eErr) {
      res.status(500).json({ error: eErr.message });
      return;
    }

    const spentByCategory = new Map<string, number>();
    for (const row of expenseRows || []) {
      if (!row.category_id) continue;
      const prev = spentByCategory.get(row.category_id) || 0;
      spentByCategory.set(row.category_id, prev + Number(row.amount_paise));
    }

    const budgets = (budgetRows || []).map((b) => {
      const cat = Array.isArray(b.categories) ? b.categories[0] : b.categories;
      const spentPaise = spentByCategory.get(b.category_id) || 0;
      const limitPaise = Number(b.limit_paise);
      return {
        id: b.id,
        categoryId: b.category_id,
        categoryName: cat?.name || 'Category',
        iconName: cat?.icon_name || 'basket-outline',
        monthYear: b.month_year,
        spentPaise,
        limitPaise,
        alertThresholdPercent: b.alert_threshold_percent,
      };
    });

    res.json({ workspaceId, monthYear, budgets });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load budgets';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/v1/transactions
 * Persists a confirmed Expense or Income transaction in integer paise to Supabase.
 */
router.post(
  '/transactions',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceId = await resolveWorkspaceId(req, 'PERSONAL');
      const {
        kind,
        categoryName,
        merchantOrPayee,
        description,
        amountRupees,
        paymentVia = 'UPI',
      } = req.body;

      const amountPaise = rupeesToPaise(amountRupees);

      // Find or create matching category in workspace
      let categoryId: string | null = null;
      if (categoryName) {
        const { data: existingCat } = await req.db!
          .from('categories')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('name', categoryName)
          .eq('kind', kind)
          .maybeSingle();

        if (existingCat?.id) {
          categoryId = existingCat.id;
        } else {
          const { data: createdCat } = await req.db!
            .from('categories')
            .insert({
              workspace_id: workspaceId,
              user_id: req.userId!,
              name: categoryName,
              kind,
            })
            .select('id')
            .single();
          categoryId = createdCat?.id || null;
        }
      }

      const { data: inserted, error } = await req.db!
        .from('transactions')
        .insert({
          workspace_id: workspaceId,
          user_id: req.userId!,
          category_id: categoryId,
          kind,
          amount_paise: amountPaise,
          payment_via: paymentVia,
          merchant_or_payee: merchantOrPayee,
          description,
        })
        .select('*')
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.status(201).json({ transaction: inserted });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create transaction';
      res.status(400).json({ error: message });
    }
  }
);

/**
 * GET /api/v1/udhaar/ledger
 * Fetches all contacts & open/partially-paid/settled udhaar obligations for the workspace.
 */
router.get(
  '/udhaar/ledger',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceId = await resolveWorkspaceId(req, 'BUSINESS');

      const { data: obligations, error } = await req.db!
        .from('udhaar_obligations')
        .select(
          `
          id,
          workspace_id,
          contact_id,
          direction,
          principal_paise,
          repaid_paise,
          remaining_paise,
          status,
          due_date,
          title_or_note,
          created_at,
          contacts ( id, display_name, phone_number, kind, net_balance_paise )
        `
        )
        .eq('workspace_id', workspaceId)
        .order('due_date', { ascending: true });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      const rows = obligations || [];
      const todayIso = new Date().toISOString().slice(0, 10);

      const items = rows.map((ob) => {
        const contact = Array.isArray(ob.contacts) ? ob.contacts[0] : ob.contacts;
        const dueDate = ob.due_date || todayIso;
        let dueTag: 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'SETTLED' = 'UPCOMING';
        if (ob.status === 'SETTLED' || Number(ob.remaining_paise) === 0) {
          dueTag = 'SETTLED';
        } else if (dueDate < todayIso) {
          dueTag = 'OVERDUE';
        } else if (dueDate === todayIso) {
          dueTag = 'DUE_TODAY';
        }

        return {
          obligationId: ob.id,
          contactId: ob.contact_id,
          displayName: contact?.display_name || 'Contact',
          phoneNumber: contact?.phone_number || '',
          kind: contact?.kind || 'CUSTOMER',
          direction: ob.direction,
          principalPaise: Number(ob.principal_paise),
          repaidPaise: Number(ob.repaid_paise),
          remainingPaise: Number(ob.remaining_paise),
          status: ob.status,
          dueDate,
          dueTag,
          titleOrNote: ob.title_or_note || '',
        };
      });

      const totalWillGetPaise = items
        .filter((i) => i.direction === 'RECEIVABLE' && i.status !== 'SETTLED')
        .reduce((sum, i) => sum + i.remainingPaise, 0);

      const totalWillGivePaise = items
        .filter((i) => i.direction === 'PAYABLE' && i.status !== 'SETTLED')
        .reduce((sum, i) => sum + i.remainingPaise, 0);

      res.json({
        workspaceId,
        summary: {
          totalWillGetPaise,
          totalWillGetFormatted: formatINR(totalWillGetPaise),
          totalWillGivePaise,
          totalWillGiveFormatted: formatINR(totalWillGivePaise),
        },
        items,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch udhaar ledger';
      res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/v1/udhaar/contacts/:contactId
 * Fetches a single contact's obligation summary and WhatsApp-style ledger timeline entries.
 */
router.get(
  '/udhaar/contacts/:contactId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { contactId } = req.params;

      const { data: contact, error: cErr } = await req.db!
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .single();

      if (cErr || !contact) {
        res.status(404).json({ error: 'Contact not found' });
        return;
      }

      const { data: obligations, error: oErr } = await req.db!
        .from('udhaar_obligations')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (oErr) {
        res.status(500).json({ error: oErr.message });
        return;
      }

      const primaryOb = obligations?.[0] || null;

      const { data: entries, error: eErr } = await req.db!
        .from('udhaar_ledger_entries')
        .select('*')
        .eq('contact_id', contactId)
        .order('occurred_at', { ascending: true });

      if (eErr) {
        res.status(500).json({ error: eErr.message });
        return;
      }

      res.json({
        contact: {
          id: contact.id,
          displayName: contact.display_name,
          phoneNumber: contact.phone_number || '',
          kind: contact.kind,
          netBalancePaise: Number(contact.net_balance_paise),
        },
        obligation: primaryOb
          ? {
              id: primaryOb.id,
              direction: primaryOb.direction,
              principalPaise: Number(primaryOb.principal_paise),
              repaidPaise: Number(primaryOb.repaid_paise),
              remainingPaise: Number(primaryOb.remaining_paise),
              status: primaryOb.status,
              dueDate: primaryOb.due_date,
              titleOrNote: primaryOb.title_or_note || '',
            }
          : null,
        entries: (entries || []).map((e) => {
          const isGave =
            e.entry_kind === 'PRINCIPAL_GAVE' || e.entry_kind === 'REPAYMENT_OUT';
          return {
            id: e.id,
            obligationId: e.obligation_id,
            contactId: e.contact_id,
            bubbleSide: isGave ? 'GAVE' : 'GOT',
            entryKind: e.entry_kind,
            amountPaise: Number(e.amount_paise),
            runningRemainingPaise: Number(e.running_remaining_paise),
            paymentVia: e.payment_via,
            note: e.note || '',
            occurredAt: e.occurred_at,
          };
        }),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load contact detail';
      res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/v1/udhaar/obligations
 * Creates a new contact & udhaar obligation + initial ledger chat bubble in Supabase.
 */
router.post(
  '/udhaar/obligations',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceId = await resolveWorkspaceId(req, 'BUSINESS');
      const {
        displayName,
        phoneNumber,
        kind = 'CUSTOMER',
        direction = 'RECEIVABLE',
        principalRupees,
        dueDate,
        titleOrNote,
      } = req.body;

      const principalPaise = rupeesToPaise(principalRupees);
      const signedNetBalance =
        direction === 'RECEIVABLE' ? principalPaise : -principalPaise;

      const { data: contact, error: cErr } = await req.db!
        .from('contacts')
        .insert({
          workspace_id: workspaceId,
          user_id: req.userId!,
          display_name: displayName,
          phone_number: phoneNumber,
          kind,
          net_balance_paise: signedNetBalance,
          notes: titleOrNote,
        })
        .select('*')
        .single();

      if (cErr || !contact) {
        res.status(500).json({ error: cErr?.message || 'Failed to create contact' });
        return;
      }

      const { data: obligation, error: oErr } = await req.db!
        .from('udhaar_obligations')
        .insert({
          workspace_id: workspaceId,
          user_id: req.userId!,
          contact_id: contact.id,
          direction,
          principal_paise: principalPaise,
          repaid_paise: 0,
          remaining_paise: principalPaise,
          status: 'OPEN',
          due_date: dueDate,
          title_or_note: titleOrNote,
        })
        .select('*')
        .single();

      if (oErr || !obligation) {
        res
          .status(500)
          .json({ error: oErr?.message || 'Failed to create udhaar obligation' });
        return;
      }

      const entryKind =
        direction === 'RECEIVABLE' ? 'PRINCIPAL_GAVE' : 'PRINCIPAL_GOT';

      await req.db!.from('udhaar_ledger_entries').insert({
        obligation_id: obligation.id,
        workspace_id: workspaceId,
        user_id: req.userId!,
        contact_id: contact.id,
        entry_kind: entryKind,
        amount_paise: principalPaise,
        running_remaining_paise: principalPaise,
        payment_via: 'CASH',
        note: titleOrNote || 'Opening Udhaar Entry',
      });

      res.status(201).json({ contact, obligation });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create udhaar';
      res.status(400).json({ error: message });
    }
  }
);

/**
 * POST /api/v1/udhaar/obligations/:obligationId/entries
 * Records a Partial/Full Repayment or additional Udhaar in integer paise in Supabase.
 */
router.post(
  '/udhaar/obligations/:obligationId/entries',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { obligationId } = req.params;
      const { action, amountRupees, paymentVia = 'UPI', note = '' } = req.body;

      const { data: ob, error: obErr } = await req.db!
        .from('udhaar_obligations')
        .select('*')
        .eq('id', obligationId)
        .single();

      if (obErr || !ob) {
        res.status(404).json({ error: 'Obligation not found' });
        return;
      }

      const amountPaise = rupeesToPaise(amountRupees);
      const principalPaise = Number(ob.principal_paise);
      const previousRepaidPaise = Number(ob.repaid_paise);
      const currentRemainingPaise = Number(ob.remaining_paise);

      const isRepayment =
        (ob.direction === 'RECEIVABLE' && action === 'GOT') ||
        (ob.direction === 'PAYABLE' && action === 'GAVE');

      if (isRepayment && currentRemainingPaise > 0) {
        const calc = calculatePartialRepayment(
          principalPaise,
          previousRepaidPaise,
          amountPaise
        );

        const { error: uErr } = await req.db!
          .from('udhaar_obligations')
          .update({
            repaid_paise: calc.newRepaidPaise,
            remaining_paise: calc.newRemainingPaise,
            status: calc.status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', obligationId);

        if (uErr) {
          res.status(500).json({ error: uErr.message });
          return;
        }

        const entryKind =
          ob.direction === 'RECEIVABLE' ? 'REPAYMENT_IN' : 'REPAYMENT_OUT';

        const { data: entry, error: eErr } = await req.db!
          .from('udhaar_ledger_entries')
          .insert({
            obligation_id: obligationId,
            workspace_id: ob.workspace_id,
            user_id: req.userId!,
            contact_id: ob.contact_id,
            entry_kind: entryKind,
            amount_paise: calc.paymentAppliedPaise,
            running_remaining_paise: calc.newRemainingPaise,
            payment_via: paymentVia,
            note: note || 'Partial Repayment',
          })
          .select('*')
          .single();

        if (eErr) {
          res.status(500).json({ error: eErr.message });
          return;
        }

        res.status(201).json({ calculation: calc, entry });
        return;
      }

      // Extending principal udhaar
      const newPrincipalPaise = principalPaise + amountPaise;
      const newRemainingPaise = currentRemainingPaise + amountPaise;
      const newStatus = previousRepaidPaise > 0 ? 'PARTIALLY_PAID' : 'OPEN';

      const { error: uErr } = await req.db!
        .from('udhaar_obligations')
        .update({
          principal_paise: newPrincipalPaise,
          remaining_paise: newRemainingPaise,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', obligationId);

      if (uErr) {
        res.status(500).json({ error: uErr.message });
        return;
      }

      const entryKind =
        action === 'GAVE' ? 'PRINCIPAL_GAVE' : 'PRINCIPAL_GOT';

      const { data: entry, error: eErr } = await req.db!
        .from('udhaar_ledger_entries')
        .insert({
          obligation_id: obligationId,
          workspace_id: ob.workspace_id,
          user_id: req.userId!,
          contact_id: ob.contact_id,
          entry_kind: entryKind,
          amount_paise: amountPaise,
          running_remaining_paise: newRemainingPaise,
          payment_via: paymentVia,
          note: note || 'Additional Udhaar',
        })
        .select('*')
        .single();

      if (eErr) {
        res.status(500).json({ error: eErr.message });
        return;
      }

      res.status(201).json({ entry });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to record ledger entry';
      res.status(400).json({ error: message });
    }
  }
);

export default router;
