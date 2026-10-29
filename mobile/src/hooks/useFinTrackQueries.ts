import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { apiFetch } from '../services/api';
import {
  WorkspaceDto,
  DashboardSummaryResponse,
  BudgetsResponse,
  UdhaarLedgerResponse,
  ContactDetailResponse,
  TransactionKind,
  PaymentChannel,
  ContactKind,
  ObligationDirection,
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
    }) =>
      apiFetch('/transactions', {
        method: 'POST',
        workspaceId,
        body: payload,
      }),
    onSuccess: () => {
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
