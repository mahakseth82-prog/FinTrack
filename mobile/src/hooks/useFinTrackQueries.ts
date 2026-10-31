import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { apiFetch } from '../services/api';
import {
  WorkspaceDto,
  DashboardSummaryResponse,
  TransactionsListResponse,
  BudgetsResponse,
  UdhaarLedgerResponse,
  ContactDetailResponse,
  TransactionKind,
  PaymentChannel,
  ContactKind,
  ObligationDirection,
  IngestionDraftDto,
  DraftIntent,
  ReminderLanguage,
  ReminderTone,
  DueReminderAlertDto,
  ComposedReminderResponse,
  DocumentVaultDto,
  DocumentVaultType,
} from '../types/ledger';

/**
 * Fetches the authenticated user's PERSONAL and BUSINESS workspaces from `/api/v1/workspaces`.
 */
export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () =>
      apiFetch<{ workspaces: WorkspaceDto[] }>('/workspaces'),
  });
}

/**
 * Fetches live dashboard metrics & recent transactions for the active workspace.
 */
export function useDashboardSummary(workspaceId: string | null) {
  return useQuery({
    queryKey: ['dashboard-summary', workspaceId],
    queryFn: () =>
      apiFetch<DashboardSummaryResponse>('/dashboard/summary', {
        workspaceId,
      }),
    enabled: Boolean(workspaceId),
  });
}

/**
 * Fetches monthly category budgets & live spent amounts for the active workspace.
 */
export function useBudgets(workspaceId: string | null, monthYear?: string) {
  const queryPath = monthYear
    ? `/budgets?monthYear=${encodeURIComponent(monthYear)}`
    : '/budgets';
  return useQuery({
    queryKey: ['budgets', workspaceId, monthYear],
    queryFn: () =>
      apiFetch<BudgetsResponse>(queryPath, {
        workspaceId,
      }),
    enabled: Boolean(workspaceId),
  });
}

/**
 * Fetches the Udhaar Khata summary and contacts list for the active workspace.
 */
export function useUdhaarLedger(workspaceId: string | null) {
  return useQuery({
    queryKey: ['udhaar-ledger', workspaceId],
    queryFn: () =>
      apiFetch<UdhaarLedgerResponse>('/udhaar/ledger', {
        workspaceId,
      }),
    enabled: Boolean(workspaceId),
  });
}

/**
 * Alias hook for contacts list within the active workspace's udhaar ledger.
 */
export function useContactsList(workspaceId: string | null) {
  return useUdhaarLedger(workspaceId);
}

/**
 * Fetches a single contact's obligation breakdown and WhatsApp-style ledger timeline.
 */
export function useContactDetail(
  workspaceId: string | null,
  contactId: string | null
) {
  return useQuery({
    queryKey: ['contact-detail', workspaceId, contactId],
    queryFn: () =>
      apiFetch<ContactDetailResponse>(`/udhaar/contacts/${contactId}`, {
        workspaceId,
      }),
    enabled: Boolean(workspaceId && contactId),
  });
}

/**
 * Mutation: Create a new confirmed Expense or Income transaction in Supabase
 * and immediately invalidate dashboard & budget caches.
 */
export function useCreateTransaction(workspaceId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      kind: TransactionKind;
      categoryName: string;
      merchantOrPayee: string;
      description: string;
      amountRupees: number | string;
      paymentVia: PaymentChannel;
      receiptImagePath?: string | null;
      receiptImageUrl?: string | null;
    }) =>
      apiFetch('/transactions', {
        method: 'POST',
        workspaceId,
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['budgets', workspaceId] });
    },
  });
}

/**
 * Mutation: Create a new Customer/Supplier/Friend Udhaar obligation in Supabase
 * and invalidate udhaar & dashboard caches.
 */
export function useCreateObligation(workspaceId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      displayName: string;
      phoneNumber: string;
      kind: ContactKind;
      direction: ObligationDirection;
      principalRupees: number | string;
      dueDate: string;
      titleOrNote: string;
    }) =>
      apiFetch('/udhaar/obligations', {
        method: 'POST',
        workspaceId,
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['udhaar-ledger', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary', workspaceId] });
    },
  });
}

/**
 * Mutation: Record a Partial/Full Repayment or additional Udhaar entry
 * and invalidate contact detail, udhaar ledger, and dashboard caches.
 */
export function useRecordLedgerEntry(
  workspaceId: string | null,
  contactId: string | null
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      obligationId: string;
      action: 'GAVE' | 'GOT';
      amountRupees: number | string;
      paymentVia: PaymentChannel;
      note: string;
    }) =>
      apiFetch(`/udhaar/obligations/${payload.obligationId}/entries`, {
        method: 'POST',
        workspaceId,
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['contact-detail', workspaceId, contactId],
      });
      queryClient.invalidateQueries({ queryKey: ['udhaar-ledger', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary', workspaceId] });
    },
  });
}

/**
 * Fetches all pending or clarification-needed drafts from `/api/v1/drafts`.
 */
export function usePendingDrafts(workspaceId: string | null) {
  return useQuery({
    queryKey: ['drafts', workspaceId],
    queryFn: () =>
      apiFetch<{ workspaceId: string; drafts: IngestionDraftDto[] }>('/drafts', {
        workspaceId,
      }),
    enabled: Boolean(workspaceId),
  });
}

/**
 * Mutation: Send voice audio or spoken Hindi/Hinglish/English text to Gemini via `/api/v1/voice/parse`.
 * Automatically saves to Passbook / Udhaar Khata and refreshes all live views.
 */
export function useParseVoiceDraft(workspaceId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      utteranceText?: string;
      audioBase64?: string;
      audioMimeType?: string;
      autoSave?: boolean;
      preferredLanguage?: 'en' | 'hi';
    }) =>
      apiFetch<{
        autoSaved?: boolean;
        savedSummary?: {
          entityTable: string;
          entityId: string;
          intent: string;
          title: string;
          amountPaise: number;
          amountFormatted: string;
          paymentVia: string;
          categoryName: string;
        };
        draft: IngestionDraftDto;
      }>('/voice/parse', {
        method: 'POST',
        workspaceId,
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts', workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ['dashboard-summary', workspaceId],
      });
      queryClient.invalidateQueries({ queryKey: ['budgets', workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ['udhaar-ledger', workspaceId],
      });
      queryClient.invalidateQueries({ queryKey: ['contact-detail'] });
    },
  });
}

/**
 * Mutation: Answer an AI ambiguity follow-up question for a draft (`/api/v1/drafts/:id/clarify`).
 */
export function useClarifyDraft(workspaceId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      draftId: string;
      clarificationAnswer?: string;
      audioBase64?: string;
      audioMimeType?: string;
    }) =>
      apiFetch<{
        autoSaved?: boolean;
        savedSummary?: {
          entityTable: string;
          entityId: string;
          intent: string;
          title: string;
          amountPaise: number;
          amountFormatted: string;
          paymentVia: string;
          categoryName: string;
        };
        draft: IngestionDraftDto;
      }>(`/drafts/${payload.draftId}/clarify`, {
        method: 'POST',
        workspaceId,
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts', workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ['dashboard-summary', workspaceId],
      });
      queryClient.invalidateQueries({ queryKey: ['budgets', workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ['udhaar-ledger', workspaceId],
      });
      queryClient.invalidateQueries({ queryKey: ['contact-detail'] });
    },
  });
}

/**
 * Mutation: Confirm & Save a draft (`/api/v1/drafts/:id/confirm`) into permanent tables
 * and invalidate all ledger, budget, and dashboard caches.
 */
export function useConfirmDraft(workspaceId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      draftId: string;
      intent?: DraftIntent;
      amountRupees?: number | string;
      contactName?: string;
      categoryName?: string;
      dueDate?: string;
      paymentVia?: PaymentChannel;
      description?: string;
    }) =>
      apiFetch<{
        confirmed: boolean;
        entityTable: string;
        entityId: string;
      }>(`/drafts/${payload.draftId}/confirm`, {
        method: 'POST',
        workspaceId,
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts', workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ['dashboard-summary', workspaceId],
      });
      queryClient.invalidateQueries({ queryKey: ['budgets', workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ['udhaar-ledger', workspaceId],
      });
      queryClient.invalidateQueries({ queryKey: ['contact-detail'] });
    },
  });
}

/**
 * Mutation: Dismiss a draft without saving (`/api/v1/drafts/:id/dismiss`).
 */
export function useDismissDraft(workspaceId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (draftId: string) =>
      apiFetch<{ dismissed: boolean }>(`/drafts/${draftId}/dismiss`, {
        method: 'POST',
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts', workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ['dashboard-summary', workspaceId],
      });
    },
  });
}

/**
 * Fetches 24-hour due and overdue udhaar alerts from `/api/v1/reminders/due-soon`.
 */
export function useDueReminders(workspaceId: string | null) {
  return useQuery({
    queryKey: ['due-reminders', workspaceId],
    queryFn: () =>
      apiFetch<{
        workspaceId: string;
        dueSoonCount: number;
        alerts: DueReminderAlertDto[];
      }>('/reminders/due-soon', { workspaceId }),
    enabled: Boolean(workspaceId),
  });
}

/**
 * Mutation: Compose a polite payment reminder message in Hinglish, Hindi, or English.
 */
export function useComposeReminder(workspaceId: string | null) {
  return useMutation({
    mutationFn: (payload: {
      obligationId: string;
      language: ReminderLanguage;
      tone: ReminderTone;
    }) =>
      apiFetch<ComposedReminderResponse>('/reminders/compose', {
        method: 'POST',
        workspaceId,
        body: payload,
      }),
  });
}

/**
 * Mutation: Log a sent WhatsApp/SMS reminder in Supabase (`public.reminders` & `public.audit_logs`).
 */
export function useLogReminderSent(workspaceId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      obligationId: string;
      contactId: string;
      channel: 'WHATSAPP' | 'SMS';
      language: ReminderLanguage;
      composedMessage: string;
    }) =>
      apiFetch('/reminders/log-sent', {
        method: 'POST',
        workspaceId,
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['due-reminders', workspaceId],
      });
    },
  });
}

/**
 * Mutation: Scan a paper bill / parchi image via Gemini Vision (`/api/v1/ingestion/bill-ocr`)
 * and automatically add the extracted spend directly to `Recent Spends`.
 */
export function useScanBillOcr(workspaceId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      imageBase64: string;
      mimeType?: string;
      saveToVault?: boolean;
      vaultTitle?: string;
      vaultDocType?: string;
      vaultExpiryDate?: string;
    }) =>
      apiFetch<{
        autoSaved?: boolean;
        draft?: IngestionDraftDto;
        savedSummary?: {
          id: string;
          title: string;
          amountPaise: number;
          amountFormatted: string;
          categoryName: string;
          paymentVia: string;
          receiptImagePath?: string | null;
          receiptImageUrl?: string | null;
          vaultDocId?: string | null;
        };
        ocrSummary?: any;
      }>('/ingestion/bill-ocr', {
        method: 'POST',
        workspaceId,
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['dashboard-summary', workspaceId],
      });
      queryClient.invalidateQueries({ queryKey: ['budgets', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['transactions', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['vault', workspaceId] });
    },
  });
}

/**
 * Query: Fetches documents stored in the Digital Document Vault for the active workspace.
 */
export function useVaultDocuments(
  workspaceId: string | null,
  filters?: { docType?: string; search?: string }
) {
  const queryParams = new URLSearchParams();
  if (filters?.docType && filters.docType !== 'ALL') {
    queryParams.append('docType', filters.docType);
  }
  if (filters?.search && filters.search.trim()) {
    queryParams.append('search', filters.search.trim());
  }
  const qs = queryParams.toString();
  const endpoint = `/vault${qs ? `?${qs}` : ''}`;

  return useQuery({
    queryKey: ['vault', workspaceId, filters?.docType, filters?.search],
    queryFn: () =>
      apiFetch<{ documents: DocumentVaultDto[] }>(endpoint, {
        workspaceId,
      }),
    enabled: Boolean(workspaceId),
  });
}

/**
 * Mutation: Uploads a standalone document or links one to a transaction in the Vault.
 */
export function useUploadVaultDocument(workspaceId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      title: string;
      docType?: DocumentVaultType;
      fileBase64?: string;
      mimeType?: string;
      fileUrl?: string;
      filePath?: string;
      expiryDate?: string;
      linkedTransactionId?: string;
      metadata?: Record<string, unknown>;
    }) =>
      apiFetch<{ success: boolean; document: DocumentVaultDto }>('/vault', {
        method: 'POST',
        workspaceId,
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['transactions', workspaceId] });
    },
  });
}

/**
 * Mutation: Delete a document from the Vault.
 */
export function useDeleteVaultDocument(workspaceId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) =>
      apiFetch<{ success: boolean; deletedId: string }>(`/vault/${documentId}`, {
        method: 'DELETE',
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault', workspaceId] });
    },
  });
}

/**
 * Mutation: Ingest an Android UPI Notification (`NotificationListenerService`)
 * with automatic SHA-256 fingerprint deduplication (`/api/v1/ingestion/upi-notification`).
 */
export function useIngestUpiNotification(workspaceId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      packageName: string;
      title: string;
      body: string;
      postedAtMs?: number;
    }) =>
      apiFetch<{
        duplicateSkipped: boolean;
        reason?: string;
        fingerprint: string;
        draft: IngestionDraftDto;
      }>('/ingestion/upi-notification', {
        method: 'POST',
        workspaceId,
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts', workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ['dashboard-summary', workspaceId],
      });
    },
  });
}

/**
 * Fetches all transactions for the workspace with optional monthYear, categoryName, and search query.
 */
export function useTransactions(
  workspaceId: string | null,
  filters?: {
    monthYear?: string;
    categoryName?: string;
    search?: string;
  }
) {
  const queryParams = new URLSearchParams();
  if (filters?.monthYear) queryParams.append('monthYear', filters.monthYear);
  if (filters?.categoryName) queryParams.append('categoryName', filters.categoryName);
  if (filters?.search) queryParams.append('search', filters.search);

  const qs = queryParams.toString();
  const endpoint = `/transactions${qs ? `?${qs}` : ''}`;

  return useQuery({
    queryKey: ['transactions', workspaceId, filters?.monthYear, filters?.categoryName, filters?.search],
    queryFn: () =>
      apiFetch<TransactionsListResponse>(endpoint, {
        workspaceId,
      }),
    enabled: Boolean(workspaceId),
  });
}

/**
 * Mutation: Delete a transaction by ID.
 */
export function useDeleteTransaction(workspaceId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (transactionId: string) =>
      apiFetch<{ success: boolean; deletedId: string }>(`/transactions/${transactionId}`, {
        method: 'DELETE',
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['budgets', workspaceId] });
    },
  });
}

/**
 * Mutation: Update a transaction (merchant, amount, category, note).
 */
export function useUpdateTransaction(workspaceId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      transactionId: string;
      merchantOrPayee?: string;
      amountRupees?: number;
      categoryName?: string;
      description?: string;
    }) =>
      apiFetch<{ success: boolean; transaction: any }>(`/transactions/${payload.transactionId}`, {
        method: 'PUT',
        workspaceId,
        body: {
          merchantOrPayee: payload.merchantOrPayee,
          amountRupees: payload.amountRupees,
          categoryName: payload.categoryName,
          description: payload.description,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['budgets', workspaceId] });
    },
  });
}



