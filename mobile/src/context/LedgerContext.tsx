import React, { createContext, useContext, useState, useMemo } from 'react';
import {
  Paise,
  rupeesToPaise,
  calculatePartialRepayment,
} from '../utils/paise';
import { WorkspaceMode } from '../theme/colors';

export type TransactionKind = 'EXPENSE' | 'INCOME';
export type PaymentChannel = 'UPI' | 'CASH' | 'CARD' | 'BANK_TRANSFER';
export type ObligationDirection = 'RECEIVABLE' | 'PAYABLE';
export type ObligationStatus = 'OPEN' | 'PARTIALLY_PAID' | 'SETTLED';
export type ContactKind = 'CUSTOMER' | 'SUPPLIER' | 'FRIEND';

export interface LedgerTransaction {
  id: string;
  workspaceMode: WorkspaceMode;
  kind: TransactionKind;
  categoryName: string;
  categoryIcon: string;
  merchantOrPayee: string;
  description: string;
  amountPaise: Paise;
  paymentVia: PaymentChannel;
  occurredAt: string;
}

export interface CategoryBudgetItem {
  id: string;
  workspaceMode: WorkspaceMode;
  categoryName: string;
  icon: string;
  spentPaise: Paise;
  limitPaise: Paise;
  alertThresholdPercent: number;
}

export interface UdhaarChatEntry {
  id: string;
  obligationId: string;
  contactId: string;
  /**
   * 'GAVE' -> Left Bubble (Soft Terracotta Red #F9E6E2 / #B84A39)
   * 'GOT'  -> Right Bubble (Soft Sage Green #E6F2EB / #3B7A57)
   */
  bubbleSide: 'GAVE' | 'GOT';
  entryKind: 'PRINCIPAL_GAVE' | 'PRINCIPAL_GOT' | 'REPAYMENT_IN' | 'REPAYMENT_OUT';
  amountPaise: Paise;
  runningRemainingPaise: Paise;
  paymentVia: PaymentChannel;
  note: string;
  occurredAt: string;
}

export interface ContactLedgerItem {
  id: string;
  workspaceMode: WorkspaceMode;
  displayName: string;
  phoneNumber: string;
  kind: ContactKind;
  direction: ObligationDirection; // RECEIVABLE = You Will Get, PAYABLE = You Will Give
  principalPaise: Paise;
  repaidPaise: Paise;
  remainingPaise: Paise;
  status: ObligationStatus;
  dueDate: string; // YYYY-MM-DD
  dueTag: 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'SETTLED';
  titleOrNote: string;
  entries: UdhaarChatEntry[];
}

interface LedgerContextValue {
  transactions: LedgerTransaction[];
  budgets: CategoryBudgetItem[];
  contacts: ContactLedgerItem[];
  detectedUpiCount: number;
  getWorkspaceTransactions: (mode: WorkspaceMode) => LedgerTransaction[];
  getWorkspaceBudgets: (mode: WorkspaceMode) => CategoryBudgetItem[];
  getWorkspaceContacts: (mode: WorkspaceMode) => ContactLedgerItem[];
  addTransaction: (params: {
    workspaceMode: WorkspaceMode;
    kind: TransactionKind;
    categoryName: string;
    merchantOrPayee: string;
    description: string;
    amountRupees: number | string;
    paymentVia: PaymentChannel;
  }) => void;
  recordContactEntry: (params: {
    contactId: string;
    action: 'GAVE' | 'GOT';
    amountRupees: number | string;
    paymentVia: PaymentChannel;
    note: string;
    dueDate?: string;
  }) => void;
  addNewContactObligation: (params: {
    workspaceMode: WorkspaceMode;
    displayName: string;
    phoneNumber: string;
    kind: ContactKind;
    direction: ObligationDirection;
    principalRupees: number | string;
    dueDate: string;
    titleOrNote: string;
  }) => ContactLedgerItem;
}

const INITIAL_TRANSACTIONS: LedgerTransaction[] = [
  // PERSONAL MODE TRANSACTIONS
  {
    id: 'tx-p-1',
    workspaceMode: 'PERSONAL',
    kind: 'INCOME',
    categoryName: 'Salary & Income',
    categoryIcon: '💼',
    merchantOrPayee: 'TechCorp India Pvt Ltd',
    description: 'October Monthly Salary Credit',
    amountPaise: rupeesToPaise(68000),
    paymentVia: 'BANK_TRANSFER',
    occurredAt: '2026-10-01 10:15 AM',
  },
  {
    id: 'tx-p-2',
    workspaceMode: 'PERSONAL',
    kind: 'EXPENSE',
    categoryName: 'Grocery & Rashan',
    categoryIcon: '🧺',
    merchantOrPayee: 'DMart Supermarket',
    description: 'Monthly Aata, Dal, Oil & Dry Fruits',
    amountPaise: rupeesToPaise(3450),
    paymentVia: 'UPI',
    occurredAt: '2026-10-26 07:40 PM',
  },
  {
    id: 'tx-p-3',
    workspaceMode: 'PERSONAL',
    kind: 'EXPENSE',
    categoryName: 'Grocery & Rashan',
    categoryIcon: '🥛',
    merchantOrPayee: 'Mother Dairy Booth',
    description: 'Milk, Paneer & Curd',
    amountPaise: rupeesToPaise(750),
    paymentVia: 'UPI',
    occurredAt: '2026-10-28 08:10 AM',
  },
  {
    id: 'tx-p-4',
    workspaceMode: 'PERSONAL',
    kind: 'EXPENSE',
    categoryName: 'Petrol & Travel',
    categoryIcon: '⛽',
    merchantOrPayee: 'IndianOil Fuel Station',
    description: 'Scooter & Car Full Tank',
    amountPaise: rupeesToPaise(2100),
    paymentVia: 'UPI',
    occurredAt: '2026-10-27 06:20 PM',
  },
  {
    id: 'tx-p-5',
    workspaceMode: 'PERSONAL',
    kind: 'EXPENSE',
    categoryName: 'Chai & Dining',
    categoryIcon: '☕',
    merchantOrPayee: 'Chaayos & Haldiram',
    description: 'Evening Samosa, Chai & Snacks',
    amountPaise: rupeesToPaise(640),
    paymentVia: 'UPI',
    occurredAt: '2026-10-29 05:30 PM',
  },
  // BUSINESS MODE TRANSACTIONS
  {
    id: 'tx-b-1',
    workspaceMode: 'BUSINESS',
    kind: 'INCOME',
    categoryName: 'Counter Bikri (Sales)',
    categoryIcon: '🏪',
    merchantOrPayee: 'Walk-in Cash & QR Sales',
    description: 'Rozana Galla Counter Collection',
    amountPaise: rupeesToPaise(42500),
    paymentVia: 'UPI',
    occurredAt: '2026-10-29 08:00 PM',
  },
  {
    id: 'tx-b-2',
    workspaceMode: 'BUSINESS',
    kind: 'EXPENSE',
    categoryName: 'Dukaan Stock / Maal',
    categoryIcon: '📦',
    merchantOrPayee: 'Mahavir Wholesale Mandi',
    description: 'Sugar, Rice & Spices Bulk Purchase',
    amountPaise: rupeesToPaise(14800),
    paymentVia: 'BANK_TRANSFER',
    occurredAt: '2026-10-28 02:15 PM',
  },
];

const INITIAL_BUDGETS: CategoryBudgetItem[] = [
  {
    id: 'bg-1',
    workspaceMode: 'PERSONAL',
    categoryName: 'Grocery & Rashan',
    icon: '🧺',
    spentPaise: rupeesToPaise(4200), // 84% of ₹5,000 -> Triggers 80%+ Warning!
    limitPaise: rupeesToPaise(5000),
    alertThresholdPercent: 80,
  },
  {
    id: 'bg-2',
    workspaceMode: 'PERSONAL',
    categoryName: 'Petrol & Travel',
    icon: '⛽',
    spentPaise: rupeesToPaise(2100),
    limitPaise: rupeesToPaise(4000),
    alertThresholdPercent: 80,
  },
  {
    id: 'bg-3',
    workspaceMode: 'PERSONAL',
    categoryName: 'Chai & Dining',
    icon: '☕',
    spentPaise: rupeesToPaise(640),
    limitPaise: rupeesToPaise(2500),
    alertThresholdPercent: 80,
  },
];

const INITIAL_CONTACTS: ContactLedgerItem[] = [
  // BUSINESS WORKSPACE CUSTOMERS & SUPPLIERS
  {
    id: 'c-ravi',
    workspaceMode: 'BUSINESS',
    displayName: 'Ravi Sharma (Kirana Buyer)',
    phoneNumber: '+919876543210',
    kind: 'CUSTOMER',
    direction: 'RECEIVABLE', // You Will Get (Lena Hai)
    principalPaise: rupeesToPaise(2000), // ₹2,000 original udhaar
    repaidPaise: rupeesToPaise(1000),    // ₹1,000 paid back
    remainingPaise: rupeesToPaise(1000), // ₹1,000 remaining
    status: 'PARTIALLY_PAID',
    dueDate: '2026-10-30',
    dueTag: 'DUE_TODAY',
    titleOrNote: '2 Peti Fortune Oil & Dry Fruits',
    entries: [
      {
        id: 'e-ravi-1',
        obligationId: 'ob-ravi',
        contactId: 'c-ravi',
        bubbleSide: 'GAVE',
        entryKind: 'PRINCIPAL_GAVE',
        amountPaise: rupeesToPaise(2000),
        runningRemainingPaise: rupeesToPaise(2000),
        paymentVia: 'CASH',
        note: 'Udhaar Diya — 2 Peti Fortune Oil & Almonds',
        occurredAt: '24 Oct, 11:30 AM',
      },
      {
        id: 'e-ravi-2',
        obligationId: 'ob-ravi',
        contactId: 'c-ravi',
        bubbleSide: 'GOT',
        entryKind: 'REPAYMENT_IN',
        amountPaise: rupeesToPaise(1000),
        runningRemainingPaise: rupeesToPaise(1000),
        paymentVia: 'UPI',
        note: 'Wapas Mila via GPay (Partial Payment)',
        occurredAt: '27 Oct, 04:45 PM',
      },
    ],
  },
  {
    id: 'c-suresh',
    workspaceMode: 'BUSINESS',
    displayName: 'Suresh Catering & Tent',
    phoneNumber: '+919811122233',
    kind: 'CUSTOMER',
    direction: 'RECEIVABLE',
    principalPaise: rupeesToPaise(5500),
    repaidPaise: rupeesToPaise(1500),
    remainingPaise: rupeesToPaise(4000),
    status: 'PARTIALLY_PAID',
    dueDate: '2026-10-26',
    dueTag: 'OVERDUE',
    titleOrNote: 'Shaadi Order Basmati Rice 50kg',
    entries: [
      {
        id: 'e-sur-1',
        obligationId: 'ob-suresh',
        contactId: 'c-suresh',
        bubbleSide: 'GAVE',
        entryKind: 'PRINCIPAL_GAVE',
        amountPaise: rupeesToPaise(5500),
        runningRemainingPaise: rupeesToPaise(5500),
        paymentVia: 'CASH',
        note: 'Udhaar Diya — 50kg Basmati Rice & Ghee Tin',
        occurredAt: '18 Oct, 01:10 PM',
      },
      {
        id: 'e-sur-2',
        obligationId: 'ob-suresh',
        contactId: 'c-suresh',
        bubbleSide: 'GOT',
        entryKind: 'REPAYMENT_IN',
        amountPaise: rupeesToPaise(1500),
        runningRemainingPaise: rupeesToPaise(4000),
        paymentVia: 'CASH',
        note: 'Cash Advance Wapas Mila',
        occurredAt: '22 Oct, 06:00 PM',
      },
    ],
  },
  {
    id: 'c-gupta-wholesaler',
    workspaceMode: 'BUSINESS',
    displayName: 'Gupta Traders (Wholesale Supplier)',
    phoneNumber: '+919922334455',
    kind: 'SUPPLIER',
    direction: 'PAYABLE', // You Will Give (Dena Hai)
    principalPaise: rupeesToPaise(8000),
    repaidPaise: rupeesToPaise(5000),
    remainingPaise: rupeesToPaise(3000),
    status: 'PARTIALLY_PAID',
    dueDate: '2026-11-05',
    dueTag: 'UPCOMING',
    titleOrNote: 'Atta & Maida Bori Stock Bill #412',
    entries: [
      {
        id: 'e-gup-1',
        obligationId: 'ob-gupta',
        contactId: 'c-gupta-wholesaler',
        bubbleSide: 'GOT',
        entryKind: 'PRINCIPAL_GOT',
        amountPaise: rupeesToPaise(8000),
        runningRemainingPaise: rupeesToPaise(8000),
        paymentVia: 'BANK_TRANSFER',
        note: 'Maal Udhaar Liya — 15 Bori Chakki Atta',
        occurredAt: '20 Oct, 03:00 PM',
      },
      {
        id: 'e-gup-2',
        obligationId: 'ob-gupta',
        contactId: 'c-gupta-wholesaler',
        bubbleSide: 'GAVE',
        entryKind: 'REPAYMENT_OUT',
        amountPaise: rupeesToPaise(5000),
        runningRemainingPaise: rupeesToPaise(3000),
        paymentVia: 'UPI',
        note: 'Partial Payment Sent via PhonePe',
        occurredAt: '25 Oct, 11:20 AM',
      },
    ],
  },
  // PERSONAL WORKSPACE FRIENDS UDHAAR
  {
    id: 'c-rohan-friend',
    workspaceMode: 'PERSONAL',
    displayName: 'Rohan (College Friend)',
    phoneNumber: '+919711223344',
    kind: 'FRIEND',
    direction: 'RECEIVABLE',
    principalPaise: rupeesToPaise(1500),
    repaidPaise: 0,
    remainingPaise: rupeesToPaise(1500),
    status: 'OPEN',
    dueDate: '2026-11-02',
    dueTag: 'UPCOMING',
    titleOrNote: 'Movie Tickets & Dinner Split',
    entries: [
      {
        id: 'e-roh-1',
        obligationId: 'ob-rohan',
        contactId: 'c-rohan-friend',
        bubbleSide: 'GAVE',
        entryKind: 'PRINCIPAL_GAVE',
        amountPaise: rupeesToPaise(1500),
        runningRemainingPaise: rupeesToPaise(1500),
        paymentVia: 'UPI',
        note: 'Paid for Rohan Movie & Dinner Split',
        occurredAt: '26 Oct, 09:45 PM',
      },
    ],
  },
  {
    id: 'c-ankit-friend',
    workspaceMode: 'PERSONAL',
    displayName: 'Ankit Neighbour',
    phoneNumber: '+919655443322',
    kind: 'FRIEND',
    direction: 'PAYABLE',
    principalPaise: rupeesToPaise(500),
    repaidPaise: 0,
    remainingPaise: rupeesToPaise(500),
    status: 'OPEN',
    dueDate: '2026-10-30',
    dueTag: 'DUE_TODAY',
    titleOrNote: 'Cylinder Cash Change Borrowed',
    entries: [
      {
        id: 'e-ank-1',
        obligationId: 'ob-ankit',
        contactId: 'c-ankit-friend',
        bubbleSide: 'GOT',
        entryKind: 'PRINCIPAL_GOT',
        amountPaise: rupeesToPaise(500),
        runningRemainingPaise: rupeesToPaise(500),
        paymentVia: 'CASH',
        note: 'Borrowed Cash for Gas Cylinder Delivery',
        occurredAt: '28 Oct, 10:00 AM',
      },
    ],
  },
];

const LedgerContext = createContext<LedgerContextValue | undefined>(undefined);

export const LedgerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [transactions, setTransactions] =
    useState<LedgerTransaction[]>(INITIAL_TRANSACTIONS);
  const [budgets, setBudgets] = useState<CategoryBudgetItem[]>(INITIAL_BUDGETS);
  const [contacts, setContacts] =
    useState<ContactLedgerItem[]>(INITIAL_CONTACTS);
  const [detectedUpiCount] = useState<number>(3);

  const addTransaction: LedgerContextValue['addTransaction'] = ({
    workspaceMode,
    kind,
    categoryName,
    merchantOrPayee,
    description,
    amountRupees,
    paymentVia,
  }) => {
    const amountPaise = rupeesToPaise(amountRupees);
    const newTx: LedgerTransaction = {
      id: `tx-${Date.now()}`,
      workspaceMode,
      kind,
      categoryName,
      categoryIcon: kind === 'INCOME' ? '💰' : '🧾',
      merchantOrPayee,
      description,
      amountPaise,
      paymentVia,
      occurredAt: 'Just now',
    };
    setTransactions((prev) => [newTx, ...prev]);

    // If it's a Personal Expense matching a budget category, update budget spentPaise deterministically
    if (workspaceMode === 'PERSONAL' && kind === 'EXPENSE') {
      setBudgets((prev) =>
        prev.map((b) =>
          b.categoryName.toLowerCase() === categoryName.toLowerCase()
            ? { ...b, spentPaise: b.spentPaise + amountPaise }
            : b
        )
      );
    }
  };

  /**
   * Deterministic Partial Repayment & Additional Udhaar Math (Rule #1 & Rule #2)
   */
  const recordContactEntry: LedgerContextValue['recordContactEntry'] = ({
    contactId,
    action,
    amountRupees,
    paymentVia,
    note,
    dueDate,
  }) => {
    const amountPaise = rupeesToPaise(amountRupees);

    setContacts((prev) =>
      prev.map((contact) => {
        if (contact.id !== contactId) return contact;

        // Case 1: Receivable Contact (Customer/Friend who owes us)
        // - If action === 'GOT', they are repaying us (reduces remainingPaise)
        // - If action === 'GAVE', we gave them more udhaar (increases principalPaise & remainingPaise)
        const isRepayment =
          (contact.direction === 'RECEIVABLE' && action === 'GOT') ||
          (contact.direction === 'PAYABLE' && action === 'GAVE');

        if (isRepayment && contact.remainingPaise > 0) {
          const calc = calculatePartialRepayment(
            contact.principalPaise,
            contact.repaidPaise,
            amountPaise
          );

          const newEntry: UdhaarChatEntry = {
            id: `entry-${Date.now()}`,
            obligationId: `ob-${contact.id}`,
            contactId: contact.id,
            bubbleSide: action,
            entryKind:
              contact.direction === 'RECEIVABLE'
                ? 'REPAYMENT_IN'
                : 'REPAYMENT_OUT',
            amountPaise: calc.paymentAppliedPaise,
            runningRemainingPaise: calc.newRemainingPaise,
            paymentVia,
            note:
              note.trim() ||
              (action === 'GOT'
                ? 'Wapas Mila (Partial Repayment)'
                : 'Wapas Diya (Repayment)'),
            occurredAt: 'Today, Just now',
          };

          return {
            ...contact,
            repaidPaise: calc.newRepaidPaise,
            remainingPaise: calc.newRemainingPaise,
            status: calc.status,
            dueTag: calc.status === 'SETTLED' ? 'SETTLED' : contact.dueTag,
            entries: [...contact.entries, newEntry],
          };
        } else {
          // Extending principal udhaar
          const updatedPrincipal = contact.principalPaise + amountPaise;
          const updatedRemaining = contact.remainingPaise + amountPaise;
          const updatedStatus: ObligationStatus =
            contact.repaidPaise > 0 ? 'PARTIALLY_PAID' : 'OPEN';

          const newEntry: UdhaarChatEntry = {
            id: `entry-${Date.now()}`,
            obligationId: `ob-${contact.id}`,
            contactId: contact.id,
            bubbleSide: action,
            entryKind:
              action === 'GAVE' ? 'PRINCIPAL_GAVE' : 'PRINCIPAL_GOT',
            amountPaise,
            runningRemainingPaise: updatedRemaining,
            paymentVia,
            note:
              note.trim() ||
              (action === 'GAVE' ? 'Naya Udhaar Diya' : 'Naya Udhaar Liya'),
            occurredAt: 'Today, Just now',
          };

          return {
            ...contact,
            principalPaise: updatedPrincipal,
            remainingPaise: updatedRemaining,
            status: updatedStatus,
            dueDate: dueDate || contact.dueDate,
            dueTag: 'UPCOMING',
            entries: [...contact.entries, newEntry],
          };
        }
      })
    );
  };

  const addNewContactObligation: LedgerContextValue['addNewContactObligation'] = ({
    workspaceMode,
    displayName,
    phoneNumber,
    kind,
    direction,
    principalRupees,
    dueDate,
    titleOrNote,
  }) => {
    const principalPaise = rupeesToPaise(principalRupees);
    const newId = `c-${Date.now()}`;
    const bubbleSide: 'GAVE' | 'GOT' =
      direction === 'RECEIVABLE' ? 'GAVE' : 'GOT';

    const newContact: ContactLedgerItem = {
      id: newId,
      workspaceMode,
      displayName,
      phoneNumber: phoneNumber || '+919876543210',
      kind,
      direction,
      principalPaise,
      repaidPaise: 0,
      remainingPaise: principalPaise,
      status: 'OPEN',
      dueDate: dueDate || '2026-11-10',
      dueTag: 'UPCOMING',
      titleOrNote: titleOrNote || 'Udhaar Entry',
      entries: [
        {
          id: `e-${Date.now()}`,
          obligationId: `ob-${newId}`,
          contactId: newId,
          bubbleSide,
          entryKind:
            bubbleSide === 'GAVE' ? 'PRINCIPAL_GAVE' : 'PRINCIPAL_GOT',
          amountPaise: principalPaise,
          runningRemainingPaise: principalPaise,
          paymentVia: 'CASH',
          note: titleOrNote || 'Opening Udhaar Entry',
          occurredAt: 'Today, Just now',
        },
      ],
    };

    setContacts((prev) => [newContact, ...prev]);
    return newContact;
  };

  const value = useMemo<LedgerContextValue>(
    () => ({
      transactions,
      budgets,
      contacts,
      detectedUpiCount,
      getWorkspaceTransactions: (m) =>
        transactions.filter((t) => t.workspaceMode === m),
      getWorkspaceBudgets: (m) =>
        budgets.filter((b) => b.workspaceMode === m),
      getWorkspaceContacts: (m) =>
        contacts.filter((c) => c.workspaceMode === m),
      addTransaction,
      recordContactEntry,
      addNewContactObligation,
    }),
    [transactions, budgets, contacts, detectedUpiCount]
  );

  return (
    <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
  );
};

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext);
  if (!ctx) {
    throw new Error('useLedger must be used inside LedgerProvider');
  }
  return ctx;
}
