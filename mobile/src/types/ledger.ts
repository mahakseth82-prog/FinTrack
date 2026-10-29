import { Paise } from '../utils/paise';
import { WorkspaceMode } from '../theme/colors';

export type TransactionKind = 'EXPENSE' | 'INCOME';
export type PaymentChannel = 'UPI' | 'CASH' | 'CARD' | 'BANK_TRANSFER';
export type ObligationDirection = 'RECEIVABLE' | 'PAYABLE';
export type ObligationStatus = 'OPEN' | 'PARTIALLY_PAID' | 'SETTLED';
export type ContactKind = 'CUSTOMER' | 'SUPPLIER' | 'FRIEND';

export interface WorkspaceDto {
  id: string;
  mode: WorkspaceMode;
  display_name: string;
  theme_primary_hex: string;
  currency_code: string;
}

export interface TransactionDto {
  id: string;
  kind: TransactionKind;
  categoryName: string;
  categoryIcon: string;
  merchantOrPayee: string;
  description: string;
  amountPaise: Paise;
  paymentVia: PaymentChannel;
  occurredAt: string;
}

export interface DashboardSummaryResponse {
  workspaceId: string;
  totalSpentPaise: Paise;
  totalIncomePaise: Paise;
  netBalancePaise: Paise;
  totalReceivablePaise: Paise;
  totalPayablePaise: Paise;
  detectedUpiCount: number;
  recentTransactions: TransactionDto[];
}

export interface BudgetDto {
  id: string;
  categoryId: string;
  categoryName: string;
  iconName: string;
  monthYear: string;
  spentPaise: Paise;
  limitPaise: Paise;
  alertThresholdPercent: number;
}

export interface BudgetsResponse {
  workspaceId: string;
  monthYear: string;
  budgets: BudgetDto[];
}

export interface UdhaarLedgerItemDto {
  obligationId: string;
  contactId: string;
  displayName: string;
  phoneNumber: string;
  kind: ContactKind;
  direction: ObligationDirection;
  principalPaise: Paise;
  repaidPaise: Paise;
  remainingPaise: Paise;
  status: ObligationStatus;
  dueDate: string;
  dueTag: 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'SETTLED';
  titleOrNote: string;
}

export interface UdhaarLedgerResponse {
  workspaceId: string;
  summary: {
    totalWillGetPaise: Paise;
    totalWillGetFormatted: string;
    totalWillGivePaise: Paise;
    totalWillGiveFormatted: string;
  };
  items: UdhaarLedgerItemDto[];
}

export interface UdhaarChatEntryDto {
  id: string;
  obligationId: string;
  contactId: string;
  bubbleSide: 'GAVE' | 'GOT';
  entryKind: 'PRINCIPAL_GAVE' | 'PRINCIPAL_GOT' | 'REPAYMENT_IN' | 'REPAYMENT_OUT';
  amountPaise: Paise;
  runningRemainingPaise: Paise;
  paymentVia: PaymentChannel;
  note: string;
  occurredAt: string;
}

export interface ContactDetailResponse {
  contact: {
    id: string;
    displayName: string;
    phoneNumber: string;
    kind: ContactKind;
    netBalancePaise: Paise;
  };
  obligation: {
    id: string;
    direction: ObligationDirection;
    principalPaise: Paise;
    repaidPaise: Paise;
    remainingPaise: Paise;
    status: ObligationStatus;
    dueDate: string;
    titleOrNote: string;
  } | null;
  entries: UdhaarChatEntryDto[];
}
