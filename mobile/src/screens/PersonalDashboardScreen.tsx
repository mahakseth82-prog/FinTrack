import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import {
  useDashboardSummary,
  useBudgets,
  useContactsList,
  useCreateTransaction,
  useParseVoiceDraft,
} from '../hooks/useFinTrackQueries';
import { TransactionDto, TransactionKind } from '../types/ledger';
import { formatINR } from '../utils/paise';
import {
  SkeletonLoader,
  EmptyStateCard,
  ErrorRetryCard,
} from '../components/QueryStateViews';

interface PersonalDashboardProps {
  onOpenContactDetail: (contactId: string) => void;
  onOpenDraftsTab: () => void;
}

interface DailyTransactionGroup {
  dateKey: string; // YYYY-MM-DD
  displayDate: string; // e.g., "Today, 29 Oct" or "28 Oct 2026"
  dailyTotalSpentPaise: number;
  items: Array<TransactionDto & { formattedTime: string }>;
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function toLocalDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatPassbookDateLabel(
  dateKey: string,
  todayKey: string,
  yesterdayKey: string
): string {
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  const year = Number(parts[0]);
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const monthName = SHORT_MONTHS[monthIdx] || parts[1];

  if (dateKey === todayKey) {
    return `Today, ${day} ${monthName}`;
  }
  if (dateKey === yesterdayKey) {
    return `Yesterday, ${day} ${monthName}`;
  }
  return `${day} ${monthName} ${year}`;
}

function formatPassbookTime(isoOrString: string): string {
  const d = new Date(isoOrString);
  if (Number.isNaN(d.getTime())) {
    return isoOrString;
  }
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
}

/**
 * 1. PAYMENT METHOD LABEL RULE (NO UNNECESSARY 'UPI' TAGS)
 * - Imported online transactions ('NOTIFICATION', 'SMS', 'EMAIL'): "📱 UPI • 08:30 PM"
 * - Card / Bank Transfer: "Card • 04:30 PM" / "Bank Transfer • 03:00 PM"
 * - Cash or Voice/Manual entry: only show timestamp ("07:49 PM")
 */
function formatTransactionSubtitle(
  tx: TransactionDto,
  formattedTime: string
): string {
  const isImported =
    tx.isImported === true ||
    ['NOTIFICATION', 'SMS', 'EMAIL', 'UPI_NOTIFICATION'].includes(
      String(tx.sourceType || '').toUpperCase()
    );

  if (isImported) {
    return `📱 UPI • ${formattedTime}`;
  }
  if (tx.paymentVia === 'CARD') {
    return `Card • ${formattedTime}`;
  }
  if (tx.paymentVia === 'BANK_TRANSFER') {
    return `Bank Transfer • ${formattedTime}`;
  }
  return formattedTime;
}

export const PersonalDashboardScreen: React.FC<PersonalDashboardProps> = ({
  onOpenContactDetail,
  onOpenDraftsTab,
}) => {
  const { palette, activeWorkspaceId } = useFinTrackTheme();

  // Live TanStack React Query Hooks (Zero hardcoded dummy data)
  const summaryQuery = useDashboardSummary(activeWorkspaceId);
  const budgetsQuery = useBudgets(activeWorkspaceId);
  const udhaarQuery = useContactsList(activeWorkspaceId);
  const createTxMutation = useCreateTransaction(activeWorkspaceId);
  const parseVoiceMutation = useParseVoiceDraft(activeWorkspaceId);

  const [quickInput, setQuickInput] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [txKind, setTxKind] = useState<TransactionKind>('EXPENSE');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('Grocery & Rashan');
  const [amountRupees, setAmountRupees] = useState('');
  const [description, setDescription] = useState('');

  const summary = summaryQuery.data;
  const budgets = budgetsQuery.data?.budgets || [];
  const personalUdhaarItems = udhaarQuery.data?.items || [];
  const recentTransactions = summary?.recentTransactions || [];

  /**
   * 4. DATA GROUPING LOGIC (NO HARDCODED DATA)
   * - Sort incoming transaction array by `occurredAt DESC`
   * - Reduce into a grouped dictionary/map keyed by date string (`YYYY-MM-DD`)
   * - Calculate daily total spent per group using integer paise
   */
  const groupedTransactions = useMemo<DailyTransactionGroup[]>(() => {
    const now = new Date();
    const todayKey = toLocalDateKey(now);
    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    const yesterdayKey = toLocalDateKey(yest);

    const sorted = [...recentTransactions].sort((a, b) => {
      const tA = new Date(a.occurredAt).getTime() || 0;
      const tB = new Date(b.occurredAt).getTime() || 0;
      return tB - tA;
    });

    const groupsMap = new Map<string, DailyTransactionGroup>();

    for (const tx of sorted) {
      const parsedDate = new Date(tx.occurredAt);
      const dateKey = !Number.isNaN(parsedDate.getTime())
        ? toLocalDateKey(parsedDate)
        : todayKey;

      let group = groupsMap.get(dateKey);
      if (!group) {
        group = {
          dateKey,
          displayDate: formatPassbookDateLabel(
            dateKey,
            todayKey,
            yesterdayKey
          ),
          dailyTotalSpentPaise: 0,
          items: [],
        };
        groupsMap.set(dateKey, group);
      }

      if (tx.kind === 'EXPENSE') {
        group.dailyTotalSpentPaise += tx.amountPaise;
      }

      group.items.push({
        ...tx,
        formattedTime: formatPassbookTime(tx.occurredAt),
      });
    }

    return Array.from(groupsMap.values());
  }, [recentTransactions]);

  // 1. Loading State
  if (
    summaryQuery.isLoading ||
    budgetsQuery.isLoading ||
    udhaarQuery.isLoading
  ) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SkeletonLoader count={4} height={80} />
      </ScrollView>
    );
  }

  // 2. Error State
  if (summaryQuery.isError) {
    const errMsg =
      summaryQuery.error instanceof Error
        ? summaryQuery.error.message
        : 'Unable to fetch Personal Passbook from backend.';
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ErrorRetryCard
          errorMessage={errMsg}
          onRetry={() => {
            summaryQuery.refetch();
            budgetsQuery.refetch();
            udhaarQuery.refetch();
          }}
        />
      </ScrollView>
    );
  }

  const handleQuickSave = async () => {
    const trimmed = quickInput.trim();
    if (!trimmed) return;
    await parseVoiceMutation.mutateAsync({
      utteranceText: trimmed,
      autoSave: true,
    });
    setQuickInput('');
  };

  const handleSaveTransaction = async () => {
    if (!amountRupees.trim() || Number(amountRupees) <= 0) return;
    await createTxMutation.mutateAsync({
      kind: txKind,
      categoryName: category.trim(),
      merchantOrPayee: merchant.trim() || category.trim(),
      description: description.trim(),
      amountRupees: amountRupees.trim(),
      paymentVia: 'UPI',
    });
    setAmountRupees('');
    setMerchant('');
    setDescription('');
    setShowAddModal(false);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Minimal Statement Summary Bar */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeaderRow}>
          <Text style={styles.summaryTitle}>Monthly Statement</Text>
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            style={[
              styles.addEntryBtn,
              { backgroundColor: palette.primaryBrown },
            ]}
          >
            <Text style={styles.addEntryBtnText}>+ Add Entry</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryMetricsRow}>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Total Spent</Text>
            <Text style={styles.metricExpenseValue}>
              {formatINR(summary?.totalSpentPaise || 0)}
            </Text>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Total Income</Text>
            <Text style={styles.metricIncomeValue}>
              {formatINR(summary?.totalIncomePaise || 0)}
            </Text>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Net Balance</Text>
            <Text style={styles.metricNetValue}>
              {formatINR(summary?.netBalancePaise || 0)}
            </Text>
          </View>
        </View>

        {/* Inline 1-Line Quick Add Bar (Auto-saves directly without extra pages) */}
        <View style={styles.quickAddRow}>
          <TextInput
            value={quickInput}
            onChangeText={setQuickInput}
            placeholder='Quick add: e.g. "Petrol 300" or "DMart 450"'
            placeholderTextColor="#94A3B8"
            onSubmitEditing={handleQuickSave}
            style={styles.quickAddInput}
          />
          <TouchableOpacity
            onPress={handleQuickSave}
            disabled={parseVoiceMutation.isPending}
            style={styles.quickAddBtn}
          >
            <Text style={styles.quickAddBtnText}>
              {parseVoiceMutation.isPending ? '...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        {(summary?.detectedUpiCount || 0) > 0 && (
          <TouchableOpacity
            onPress={onOpenDraftsTab}
            style={styles.pendingDraftsStrip}
          >
            <Text style={styles.pendingDraftsText}>
              {summary?.detectedUpiCount} pending draft(s) awaiting confirmation
            </Text>
            <Text style={styles.pendingDraftsLink}>Review →</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 2. Compact & Clean Monthly Budgets Card */}
      <View style={styles.card}>
        <Text style={styles.cardSectionTitle}>Monthly Budgets</Text>

        {budgets.length === 0 ? (
          <Text style={styles.subtleEmptyText}>
            No category budgets set for this month.
          </Text>
        ) : (
          <View style={styles.budgetListWrap}>
            {budgets.map((b) => {
              const pct = Math.min(
                100,
                Math.round((b.spentPaise / b.limitPaise) * 100)
              );
              const isOverThreshold = pct >= b.alertThresholdPercent;

              return (
                <View key={b.id} style={styles.budgetRowItem}>
                  <View style={styles.budgetTextRow}>
                    <Text style={styles.budgetCategoryName}>
                      {b.categoryName}
                    </Text>
                    <Text style={styles.budgetNumbersText}>
                      {formatINR(b.spentPaise)} / {formatINR(b.limitPaise)}
                    </Text>
                  </View>

                  {/* Slim, subtle 4px progress bar — changes color at >=80% without noisy text banners */}
                  <View style={styles.slimProgressTrack}>
                    <View
                      style={[
                        styles.slimProgressFill,
                        {
                          width: `${pct}%`,
                          backgroundColor: isOverThreshold
                            ? '#B91C1C'
                            : '#475569',
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* 3. Personal Udhaar Compact Summary (If any contacts exist) */}
      {(personalUdhaarItems.length > 0 ||
        (summary?.totalReceivablePaise || 0) > 0 ||
        (summary?.totalPayablePaise || 0) > 0) && (
        <View style={styles.card}>
          <View style={styles.udhaarHeaderRow}>
            <Text style={styles.cardSectionTitle}>Personal Udhaar</Text>
            <Text style={styles.udhaarNetSummary}>
              Get:{' '}
              <Text style={{ color: '#15803D', fontWeight: '600' }}>
                {formatINR(summary?.totalReceivablePaise || 0)}
              </Text>
              {'  •  '}
              Owe:{' '}
              <Text style={{ color: '#B91C1C', fontWeight: '600' }}>
                {formatINR(summary?.totalPayablePaise || 0)}
              </Text>
            </Text>
          </View>

          {personalUdhaarItems.map((friend) => (
            <TouchableOpacity
              key={friend.obligationId}
              onPress={() => onOpenContactDetail(friend.contactId)}
              style={styles.compactFriendRow}
            >
              <View>
                <Text style={styles.txMerchantText}>{friend.displayName}</Text>
                <Text style={styles.txSubtleMeta}>
                  Due {friend.dueDate}
                  {friend.titleOrNote ? ` • ${friend.titleOrNote}` : ''}
                </Text>
              </View>
              <Text
                style={[
                  styles.txAmountText,
                  {
                    color:
                      friend.direction === 'RECEIVABLE' ? '#15803D' : '#B91C1C',
                  },
                ]}
              >
                {friend.direction === 'RECEIVABLE' ? '+ ' : '- '}
                {formatINR(friend.remainingPaise)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 4. Minimal Date-Based Recent Spends List */}
      <View style={styles.passbookContainer}>
        <View style={styles.passbookTitleWrap}>
          <Text style={styles.cardSectionTitle}>Recent Spends</Text>
        </View>

        {groupedTransactions.length === 0 ? (
          <View style={{ padding: 16 }}>
            <EmptyStateCard
              title="No Spends Yet"
              message="Tap + Add Entry or use the Voice button to record your first entry."
              actionLabel="+ Add Entry"
              onActionPress={() => setShowAddModal(true)}
            />
          </View>
        ) : (
          groupedTransactions.map((group) => (
            <View key={group.dateKey}>
              {/* Clean Date Separator Bar */}
              <View style={styles.dateSeparatorBar}>
                <Text style={styles.dateSeparatorLeft}>
                  {group.displayDate}
                </Text>
                <Text style={styles.dateSeparatorRight}>
                  Total: {formatINR(group.dailyTotalSpentPaise)}
                </Text>
              </View>

              {/* Compact Two-Column Transaction Rows */}
              {group.items.map((tx) => {
                const isIncome = tx.kind === 'INCOME';
                return (
                  <View key={tx.id} style={styles.passbookRow}>
                    <View style={styles.passbookRowLeft}>
                      <Text style={styles.txMerchantText} numberOfLines={1}>
                        {tx.merchantOrPayee}
                      </Text>
                      <Text style={styles.txSubtleMeta}>
                        {formatTransactionSubtitle(tx, tx.formattedTime)}
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.txAmountText,
                        { color: isIncome ? '#15803D' : '#B91C1C' },
                      ]}
                    >
                      {isIncome ? '+ ' : '- '}
                      {formatINR(tx.amountPaise)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))
        )}
      </View>

      {/* Clean Modal: Add Personal Entry */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Passbook Entry</Text>

            <View style={styles.kindToggleRow}>
              {(['EXPENSE', 'INCOME'] as TransactionKind[]).map((k) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setTxKind(k)}
                  style={[
                    styles.kindBtn,
                    txKind === k && {
                      backgroundColor: palette.primaryBrown,
                      borderColor: palette.primaryBrown,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontWeight: '600',
                      fontSize: 13,
                      color: txKind === k ? '#FFFFFF' : '#0F172A',
                    }}
                  >
                    {k === 'EXPENSE' ? 'Expense' : 'Income'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Amount (₹)</Text>
            <TextInput
              value={amountRupees}
              onChangeText={setAmountRupees}
              placeholder="0.00"
              keyboardType="numeric"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Merchant or Person</Text>
            <TextInput
              value={merchant}
              onChangeText={setMerchant}
              placeholder="e.g. DMart Supermarket"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Category</Text>
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder="e.g. Grocery & Rashan"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveTransaction}
                disabled={createTxMutation.isPending}
                style={[
                  styles.saveBtn,
                  { backgroundColor: palette.primaryBrown },
                ]}
              >
                <Text style={styles.saveBtnText}>
                  {createTxMutation.isPending ? 'Saving...' : 'Confirm & Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: 14,
    paddingBottom: 90,
    gap: 12,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  addEntryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addEntryBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  summaryMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricCol: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 3,
  },
  metricExpenseValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#B91C1C',
  },
  metricIncomeValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#15803D',
  },
  metricNetValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  metricDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 10,
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  quickAddInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: '#0F172A',
  },
  quickAddBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  pendingDraftsStrip: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendingDraftsText: {
    fontSize: 12,
    color: '#475569',
  },
  pendingDraftsLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtleEmptyText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
  },
  budgetListWrap: {
    marginTop: 10,
    gap: 10,
  },
  budgetRowItem: {
    gap: 5,
  },
  budgetTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  budgetCategoryName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0F172A',
  },
  budgetNumbersText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  slimProgressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  slimProgressFill: {
    height: 4,
    borderRadius: 2,
  },
  udhaarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  udhaarNetSummary: {
    fontSize: 12,
    color: '#64748B',
  },
  compactFriendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  passbookContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  passbookTitleWrap: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  dateSeparatorBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  dateSeparatorLeft: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  dateSeparatorRight: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  passbookRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  passbookRowLeft: {
    flex: 1,
    paddingRight: 12,
  },
  txMerchantText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  txSubtleMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  txAmountText: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  kindToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  kindBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0F172A',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: 13,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
});
