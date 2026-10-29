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
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFinTrackTheme } from '../context/ThemeContext';
import { SYSTEM_FONT_STACK } from '../theme/colors';
import {
  useDashboardSummary,
  useBudgets,
  useContactsList,
  useCreateTransaction,
  useParseVoiceDraft,
  useScanBillOcr,
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
}

interface DailyTransactionGroup {
  dateKey: string; // YYYY-MM-DD
  displayDate: string; // e.g., "Today, 30 Oct 2026" or "28 Oct 2026"
  dailyNetSpentPaise: number;
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

function formatExecutiveDateLabel(
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
    return `Today, ${day} ${monthName} ${year}`;
  }
  if (dateKey === yesterdayKey) {
    return `Yesterday, ${day} ${monthName} ${year}`;
  }
  return `${day} ${monthName} ${year}`;
}

function formatExecutiveTime(isoOrString: string): string {
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
 * Payment Method Subtitle Rule (No emojis or unnecessary tags):
 * - Imported online transactions ('NOTIFICATION', 'SMS', 'EMAIL'): "UPI • 07:49 PM"
 * - Card / Bank Transfer: "Card • 04:30 PM" / "Bank Transfer • 03:00 PM"
 * - Cash or Voice/Manual entry: "07:49 PM"
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
    return `UPI • ${formattedTime}`;
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
}) => {
  const { palette, activeWorkspaceId } = useFinTrackTheme();

  // Live TanStack React Query Hooks
  const summaryQuery = useDashboardSummary(activeWorkspaceId);
  const budgetsQuery = useBudgets(activeWorkspaceId);
  const udhaarQuery = useContactsList(activeWorkspaceId);
  const createTxMutation = useCreateTransaction(activeWorkspaceId);
  const parseVoiceMutation = useParseVoiceDraft(activeWorkspaceId);
  const scanBillMutation = useScanBillOcr(activeWorkspaceId);

  const [quickInput, setQuickInput] = useState('');
  const [scanStatusMsg, setScanStatusMsg] = useState<string | null>(null);
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
          displayDate: formatExecutiveDateLabel(
            dateKey,
            todayKey,
            yesterdayKey
          ),
          dailyNetSpentPaise: 0,
          items: [],
        };
        groupsMap.set(dateKey, group);
      }

      if (tx.kind === 'EXPENSE') {
        group.dailyNetSpentPaise += tx.amountPaise;
      }

      group.items.push({
        ...tx,
        formattedTime: formatExecutiveTime(tx.occurredAt),
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
        : 'Unable to load workspace transactions.';
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
    setScanStatusMsg(null);
    await parseVoiceMutation.mutateAsync({
      utteranceText: trimmed,
      autoSave: true,
    });
    setQuickInput('');
  };

  const handleScanBill = async () => {
    setScanStatusMsg(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.[0]?.base64) {
        return;
      }

      const asset = result.assets[0];
      setScanStatusMsg('Scanning receipt...');
      const res = await scanBillMutation.mutateAsync({
        imageBase64: asset.base64!,
        mimeType: asset.mimeType || 'image/jpeg',
      });

      if (res.savedSummary) {
        setScanStatusMsg(
          `Added: ${res.savedSummary.title} (-${res.savedSummary.amountFormatted})`
        );
        setTimeout(() => setScanStatusMsg(null), 3500);
      } else {
        setScanStatusMsg(null);
      }
    } catch (err: unknown) {
      setScanStatusMsg(
        err instanceof Error ? err.message : 'Unable to process receipt image'
      );
    }
  };

  const handleSaveTransaction = async () => {
    if (!amountRupees.trim() || Number(amountRupees) <= 0) return;
    await createTxMutation.mutateAsync({
      kind: txKind,
      categoryName: category.trim(),
      merchantOrPayee: merchant.trim() || category.trim(),
      description: description.trim(),
      amountRupees: amountRupees.trim(),
      paymentVia: 'CASH',
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
      {/* 1. Executive Overview Card */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.sectionHeader}>OVERVIEW</Text>
          <View style={styles.headerActionBtns}>
            <TouchableOpacity
              onPress={handleScanBill}
              disabled={scanBillMutation.isPending}
              style={styles.iconActionBtn}
            >
              <Feather name="camera" size={14} color="#475569" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowAddModal(true)}
              style={[
                styles.primarySmallBtn,
                { backgroundColor: palette.primaryBrown },
              ]}
            >
              <Text style={styles.primarySmallBtnText}>New Transaction</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.summaryMetricsRow}>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Total Outflow</Text>
            <Text style={styles.metricExpenseValue}>
              {formatINR(summary?.totalSpentPaise || 0)}
            </Text>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Total Inflow</Text>
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

        {/* Inline Quick Entry Bar + Receipt Camera Trigger */}
        <View style={styles.quickAddRow}>
          <TextInput
            value={quickInput}
            onChangeText={setQuickInput}
            placeholder='Quick entry (e.g. "Petrol 300" or "DMart 450")'
            placeholderTextColor="#94A3B8"
            onSubmitEditing={handleQuickSave}
            style={styles.quickAddInput}
          />
          <TouchableOpacity
            onPress={handleScanBill}
            disabled={scanBillMutation.isPending}
            style={styles.quickCameraBtn}
          >
            <Feather name="camera" size={15} color="#475569" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleQuickSave}
            disabled={parseVoiceMutation.isPending}
            style={[
              styles.quickAddBtn,
              { backgroundColor: palette.primaryBrown },
            ]}
          >
            <Text style={styles.quickAddBtnText}>
              {parseVoiceMutation.isPending ? 'Saving' : 'Add'}
            </Text>
          </TouchableOpacity>
        </View>

        {scanStatusMsg && (
          <Text style={styles.scanStatusText}>{scanStatusMsg}</Text>
        )}
      </View>

      {/* 2. Compact Monthly Budgets Card */}
      <View style={styles.card}>
        <Text style={styles.sectionHeader}>MONTHLY BUDGETS</Text>

        {budgets.length === 0 ? (
          <Text style={styles.subtleEmptyText}>
            No category budgets configured for this period.
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

                  <View style={styles.slimProgressTrack}>
                    <View
                      style={[
                        styles.slimProgressFill,
                        {
                          width: `${pct}%`,
                          backgroundColor: isOverThreshold
                            ? '#991B1B'
                            : palette.primaryBrown,
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

      {/* 3. Credit & Receivables Summary (If any contacts exist in Personal workspace) */}
      {(personalUdhaarItems.length > 0 ||
        (summary?.totalReceivablePaise || 0) > 0 ||
        (summary?.totalPayablePaise || 0) > 0) && (
        <View style={styles.card}>
          <View style={styles.udhaarHeaderRow}>
            <Text style={styles.sectionHeader}>CREDIT & RECEIVABLES</Text>
            <Text style={styles.udhaarNetSummary}>
              Receivable:{' '}
              <Text style={{ color: '#065F46', fontWeight: '600' }}>
                {formatINR(summary?.totalReceivablePaise || 0)}
              </Text>
              {'  •  '}
              Payable:{' '}
              <Text style={{ color: '#991B1B', fontWeight: '600' }}>
                {formatINR(summary?.totalPayablePaise || 0)}
              </Text>
            </Text>
          </View>

          {personalUdhaarItems.map((item) => (
            <TouchableOpacity
              key={item.obligationId}
              onPress={() => onOpenContactDetail(item.contactId)}
              style={styles.compactFriendRow}
            >
              <View>
                <Text style={styles.txMerchantText}>{item.displayName}</Text>
                <Text style={styles.txSubtleMeta}>
                  Due {item.dueDate}
                  {item.titleOrNote ? ` • ${item.titleOrNote}` : ''}
                </Text>
              </View>
              <Text
                style={[
                  styles.txAmountText,
                  {
                    color:
                      item.direction === 'RECEIVABLE' ? '#065F46' : '#991B1B',
                  },
                ]}
              >
                {item.direction === 'RECEIVABLE' ? '+' : '-'}
                {formatINR(item.remainingPaise, true)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 4. Executive Transaction List & Date Headers */}
      <View style={styles.transactionsCard}>
        <View style={styles.transactionsTitleWrap}>
          <Text style={styles.sectionHeader}>TRANSACTIONS</Text>
        </View>

        {groupedTransactions.length === 0 ? (
          <View style={{ padding: 16 }}>
            <EmptyStateCard
              title="No Transactions Recorded"
              message="Use the quick entry bar or microphone button to record a transaction."
              actionLabel="New Transaction"
              onActionPress={() => setShowAddModal(true)}
            />
          </View>
        ) : (
          groupedTransactions.map((group) => (
            <View key={group.dateKey}>
              {/* Date Separator Bar */}
              <View style={styles.dateSeparatorBar}>
                <Text style={styles.dateSeparatorLeft}>
                  {group.displayDate}
                </Text>
                <Text style={styles.dateSeparatorRight}>
                  Net: {formatINR(group.dailyNetSpentPaise)}
                </Text>
              </View>

              {/* Two-Column Transaction Line Items */}
              {group.items.map((tx) => {
                const isIncome = tx.kind === 'INCOME';
                return (
                  <View key={tx.id} style={styles.txLineItem}>
                    <View style={styles.txColLeft}>
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
                        { color: isIncome ? '#065F46' : '#991B1B' },
                      ]}
                    >
                      {isIncome ? '+' : '-'}
                      {formatINR(tx.amountPaise, true)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))
        )}
      </View>

      {/* Modal: New Transaction */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Transaction</Text>

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
                      fontFamily: SYSTEM_FONT_STACK,
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

            <Text style={styles.inputLabel}>Amount (INR)</Text>
            <TextInput
              value={amountRupees}
              onChangeText={setAmountRupees}
              placeholder="0.00"
              keyboardType="numeric"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Merchant or Counterparty</Text>
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
                  {createTxMutation.isPending ? 'Saving...' : 'Save Transaction'}
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeader: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.65,
  },
  headerActionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primarySmallBtn: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 6,
  },
  primarySmallBtnText: {
    fontFamily: SYSTEM_FONT_STACK,
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
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 3,
  },
  metricExpenseValue: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 16,
    fontWeight: '600',
    color: '#991B1B',
    fontVariant: ['tabular-nums'],
  },
  metricIncomeValue: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 16,
    fontWeight: '600',
    color: '#065F46',
    fontVariant: ['tabular-nums'],
  },
  metricNetValue: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
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
    fontFamily: SYSTEM_FONT_STACK,
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: '#0F172A',
  },
  quickCameraBtn: {
    width: 36,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddBtn: {
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddBtnText: {
    fontFamily: SYSTEM_FONT_STACK,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  scanStatusText: {
    fontFamily: SYSTEM_FONT_STACK,
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
    color: '#065F46',
  },
  subtleEmptyText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 8,
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
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 13,
    fontWeight: '500',
    color: '#0F172A',
  },
  budgetNumbersText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    fontVariant: ['tabular-nums'],
  },
  slimProgressTrack: {
    height: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 2,
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
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    color: '#64748B',
    fontVariant: ['tabular-nums'],
  },
  compactFriendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  transactionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  transactionsTitleWrap: {
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
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  dateSeparatorLeft: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  dateSeparatorRight: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '400',
    color: '#64748B',
    fontVariant: ['tabular-nums'],
  },
  txLineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  txColLeft: {
    flex: 1,
    paddingRight: 12,
  },
  txMerchantText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 15,
    fontWeight: '500',
    color: '#0F172A',
  },
  txSubtleMeta: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '400',
    color: '#94A3B8',
    marginTop: 3,
  },
  txAmountText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalTitle: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 14,
  },
  kindToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  kindBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  inputLabel: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 5,
    marginTop: 8,
  },
  input: {
    fontFamily: SYSTEM_FONT_STACK,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
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
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
