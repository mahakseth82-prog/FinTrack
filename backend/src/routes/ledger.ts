import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import {
  rupeesToPaise,
  formatINR,
  calculatePartialRepayment,
  Paise,
} from '../utils/paise';

const router = Router();

export interface BackendLedgerEntry {
  id: string;
  obligationId: string;
  contactId: string;
  entryKind: 'PRINCIPAL_GAVE' | 'PRINCIPAL_GOT' | 'REPAYMENT_IN' | 'REPAYMENT_OUT';
  amountPaise: Paise;
  runningRemainingPaise: Paise;
  paymentVia: 'UPI' | 'CASH' | 'BANK_TRANSFER';
  note: string;
  occurredAt: string;
}

export interface BackendObligation {
  id: string;
  workspaceId: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  direction: 'RECEIVABLE' | 'PAYABLE';
  principalPaise: Paise;
  repaidPaise: Paise;
  remainingPaise: Paise;
  status: 'OPEN' | 'PARTIALLY_PAID' | 'SETTLED';
  dueDate: string;
  titleOrNote: string;
  entries: BackendLedgerEntry[];
}

// In-memory store for instant API testing when Supabase .env is not yet connected
const obligationsStore: BackendObligation[] = [
  {
    id: 'ob-ravi-001',
    workspaceId: 'ws-business-001',
    contactId: 'contact-ravi',
    contactName: 'Ravi Kirana & General Store',
    contactPhone: '+919876543210',
    direction: 'RECEIVABLE',
    principalPaise: 200000, // ₹2,000
    repaidPaise: 100000,    // ₹1,000 paid
    remainingPaise: 100000, // ₹1,000 remaining
    status: 'PARTIALLY_PAID',
    dueDate: '2026-10-30',
    titleOrNote: 'Diwali Dry Fruits & Oil Carton',
    entries: [
      {
        id: 'le-1',
        obligationId: 'ob-ravi-001',
        contactId: 'contact-ravi',
        entryKind: 'PRINCIPAL_GAVE',
        amountPaise: 200000,
        runningRemainingPaise: 200000,
        paymentVia: 'CASH',
        note: 'Udhaar Diya — 2 Peti Fortune Oil',
        occurredAt: '2026-10-25T11:15:00+05:30',
      },
      {
        id: 'le-2',
        obligationId: 'ob-ravi-001',
        contactId: 'contact-ravi',
        entryKind: 'REPAYMENT_IN',
        amountPaise: 100000,
        runningRemainingPaise: 100000,
        paymentVia: 'UPI',
        note: 'Wapas Mila via PhonePe (Partial Payment)',
        occurredAt: '2026-10-27T16:40:00+05:30',
      },
    ],
  },
];

/**
 * GET /api/ledger/obligations
 * Returns obligations for a workspace with formatted INR values.
 */
router.get('/obligations', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = (req.query.workspaceId as string) || 'ws-business-001';
  const filtered = obligationsStore.filter((o) => o.workspaceId === workspaceId);

  const totalReceivablePaise = filtered
    .filter((o) => o.direction === 'RECEIVABLE' && o.status !== 'SETTLED')
    .reduce((sum, o) => sum + o.remainingPaise, 0);

  const totalPayablePaise = filtered
    .filter((o) => o.direction === 'PAYABLE' && o.status !== 'SETTLED')
    .reduce((sum, o) => sum + o.remainingPaise, 0);

  res.json({
    workspaceId,
    summary: {
      totalReceivablePaise,
      totalReceivableFormatted: formatINR(totalReceivablePaise),
      totalPayablePaise,
      totalPayableFormatted: formatINR(totalPayablePaise),
    },
    obligations: filtered,
  });
});

/**
 * POST /api/ledger/obligations/:id/repay
 * Deterministic Partial Repayment Endpoint (Rule #1 & Rule #2)
 */
router.post(
  '/obligations/:id/repay',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { amountRupees, paymentVia = 'UPI', note = 'Partial Payment' } = req.body;

      const obligation = obligationsStore.find((o) => o.id === id);
      if (!obligation) {
        res.status(404).json({ error: 'Obligation not found' });
        return;
      }

      const paymentPaise = rupeesToPaise(amountRupees);
      const calc = calculatePartialRepayment(
        obligation.principalPaise,
        obligation.repaidPaise,
        paymentPaise
      );

      obligation.repaidPaise = calc.newRepaidPaise;
      obligation.remainingPaise = calc.newRemainingPaise;
      obligation.status = calc.status;

      const newEntry: BackendLedgerEntry = {
        id: `le-${Date.now()}`,
        obligationId: obligation.id,
        contactId: obligation.contactId,
        entryKind:
          obligation.direction === 'RECEIVABLE' ? 'REPAYMENT_IN' : 'REPAYMENT_OUT',
        amountPaise: calc.paymentAppliedPaise,
        runningRemainingPaise: calc.newRemainingPaise,
        paymentVia,
        note,
        occurredAt: new Date().toISOString(),
      };

      obligation.entries.push(newEntry);

      res.json({
        obligation,
        calculation: calc,
        formattedRemaining: formatINR(calc.newRemainingPaise),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Repayment error';
      res.status(400).json({ error: message });
    }
  }
);

export default router;
