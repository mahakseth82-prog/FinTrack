import { Paise } from '../utils/paise';
import { WorkspaceMode } from '../theme/colors';

export type TransactionKind = 'EXPENSE' | 'INCOME';
export type PaymentChannel = 'UPI' | 'CASH' | 'CARD' | 'BANK_TRANSFER';
export type ObligationDirection = 'RECEIVABLE' | 'PAYABLE';
export type ObligationStatus = 'OPEN' | 'PARTIALLY_PAID' | 'SETTLED';
export type ContactKind = 'CUSTOMER' | 'SUPPLIER' | 'FRIEND';
export type DraftSource = 'VOICE' | 'BILL_OCR' | 'UPI_NOTIFICATION' | 'MANUAL';
export type DraftIntent =
  | 'EXPENSE'
  | 'INCOME'
  | 'UDHAAR_GAVE'
  | 'UDHAAR_GOT'
  | 'UDHAAR_REPAYMENT';
export type DraftStatus =
  | 'NEEDS_CLARIFICATION'
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'DISMISSED';

export type AppLanguage = 'en' | 'hi';

export interface IngestionDraftDto {
  id: string;
  workspaceId: string;
  source: DraftSource;
  intent: DraftIntent;
  status: DraftStatus;
  rawInputText: string;
  extractedAmountPaise: Paise | null;
  extractedAmountRupees: number | null;
  extractedAmountFormatted: string | null;
  extractedContactName: string | null;
  normalizedTitle?: string | null;
  matchedContactId: string | null;
  extractedCategoryName: string | null;
  extractedDueDate: string | null;
  paymentVia: PaymentChannel;
  ambiguityQuestion: string | null;
  aiConfidence: number;
  description: string;
  createdAt: string;
}

export type ReminderLanguage = 'HINGLISH' | 'HINDI' | 'ENGLISH';
export type ReminderTone = 'FRIENDLY' | 'FORMAL';

export interface DueReminderAlertDto {
  obligationId: string;
  contactId: string;
  contactName: string;
  phoneNumber: string;
  principalPaise: Paise;
  repaidPaise: Paise;
  remainingPaise: Paise;
  remainingFormatted: string;
  dueDate: string;
  urgency: 'OVERDUE' | 'DUE_TODAY' | 'DUE_IN_24H';
  titleOrNote: string;
}

export interface ComposedReminderResponse {
  obligationId: string;
  contactId: string;
  contactName: string;
  phoneNumber: string;
  language: ReminderLanguage;
  tone: ReminderTone;
  message: string;
}

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
  sourceType?: string;
  isImported?: boolean;
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

export interface TransactionsListResponse {
  workspaceId: string;
  monthYear: string;
  totalSpentPaise: Paise;
  totalIncomePaise: Paise;
  transactions: TransactionDto[];
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



