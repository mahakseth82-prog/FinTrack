import React, { useState } from 'react';
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
} from '../hooks/useFinTrackQueries';
import { TransactionKind } from '../types/ledger';
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

  const [showAddModal, setShowAddModal] = useState(false);
  const [txKind, setTxKind] = useState<TransactionKind>('EXPENSE');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('Grocery & Rashan');
  const [amountRupees, setAmountRupees] = useState('');
  const [description, setDescription] = useState('');

  // 1. Loading State -> Animated Skeleton Placeholder Loaders
  if (
    summaryQuery.isLoading ||
    budgetsQuery.isLoading ||
    udhaarQuery.isLoading
  ) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SkeletonLoader count={4} height={110} />
      </ScrollView>
    );
  }

  // 2. Error State -> Clean Retry Button
  if (summaryQuery.isError) {
    const errMsg =
      summaryQuery.error instanceof Error
        ? summaryQuery.error.message
        : 'Unable to fetch Personal Dashboard from backend.';
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

  const summary = summaryQuery.data;
  const budgets = budgetsQuery.data?.budgets || [];
  const personalUdhaarItems = udhaarQuery.data?.items || [];
  const recentTransactions = summary?.recentTransactions || [];

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
      {/* 1. Monthly Spent vs Income Summary Card (Live Backend Data) */}
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: palette.primaryBrown },
        ]}
      >
        <View style={styles.summaryHeaderRow}>
          <Text style={[styles.summaryMonthText, { color: palette.accentWarm }]}>
            GHAR KA KHATA • LIVE SUMMARY
          </Text>
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            style={[
              styles.quickAddBtn,
              { backgroundColor: palette.accentWarm },
            ]}
          >
            <Text
              style={[styles.quickAddBtnText, { color: palette.textEspresso }]}
            >
              + Add Entry
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryMetricsRow}>
          <View style={styles.metricBlock}>
            <Text style={[styles.metricLabel, { color: palette.surfaceBeige }]}>
              Total Spent (Kharcha)
            </Text>
            <Text style={[styles.metricValue, { color: palette.textOnPrimary }]}>
              {formatINR(summary?.totalSpentPaise || 0)}
            </Text>
          </View>

          <View
            style={[
              styles.metricDivider,
              { backgroundColor: 'rgba(250, 246, 240, 0.22)' },
            ]}
          />

          <View style={styles.metricBlock}>
            <Text style={[styles.metricLabel, { color: palette.surfaceBeige }]}>
              Total Income (Kamaai)
            </Text>
            <Text style={[styles.metricValue, { color: '#C6F6D5' }]}>
              {formatINR(summary?.totalIncomePaise || 0)}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.savingsFooter,
            { borderTopColor: 'rgba(250, 246, 240, 0.18)' },
          ]}
        >
          <Text style={[styles.savingsText, { color: palette.surfaceBeige }]}>
            Net Balance:{' '}
            <Text style={{ fontWeight: '800', color: palette.textOnPrimary }}>
              {formatINR(summary?.netBalancePaise || 0)}
            </Text>
          </Text>
        </View>
      </View>

      {/* 2. UPI Payments Detected Banner (Rendered when pending drafts exist) */}
      {(summary?.detectedUpiCount || 0) > 0 && (
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onOpenDraftsTab}
          style={[
            styles.upiBanner,
            {
              backgroundColor: palette.warningAmberTint,
              borderColor: palette.accentWarm,
            },
          ]}
        >
          <View style={styles.upiBannerLeft}>
            <Text style={styles.upiBellIcon}>🔔</Text>
            <View>
              <Text
                style={[styles.upiBannerTitle, { color: palette.textEspresso }]}
              >
                {summary?.detectedUpiCount} UPI Payments Detected
              </Text>
              <Text style={[styles.upiBannerSub, { color: palette.textMocha }]}>
                Tap to review & confirm into your ledger
              </Text>
            </View>
          </View>
          <Text style={[styles.upiArrow, { color: palette.primaryBrown }]}>
            →
          </Text>
        </TouchableOpacity>
      )}

      {/* 3. Personal & Friends Udhaar Section */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: palette.surfaceBeige,
            borderColor: palette.borderLatte,
          },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: palette.textEspresso }]}>
          🤝 Personal & Friends Udhaar
        </Text>

        <View style={styles.udhaarSplitRow}>
          <View
            style={[
              styles.udhaarMiniBox,
              {
                backgroundColor: palette.receiveSageTint,
                borderColor: palette.receiveSageGreen,
              },
            ]}
          >
            <Text
              style={[
                styles.udhaarMiniLabel,
                { color: palette.receiveSageGreen },
              ]}
            >
              You Will Get (Lena Hai)
            </Text>
            <Text
              style={[
                styles.udhaarMiniAmount,
                { color: palette.receiveSageGreen },
              ]}
            >
              {formatINR(summary?.totalReceivablePaise || 0)}
            </Text>
          </View>

          <View
            style={[
              styles.udhaarMiniBox,
              {
                backgroundColor: palette.giveTerracottaTint,
                borderColor: palette.giveTerracottaRed,
              },
            ]}
          >
            <Text
              style={[
                styles.udhaarMiniLabel,
                { color: palette.giveTerracottaRed },
              ]}
            >
              You Owe (Dena Hai)
            </Text>
            <Text
              style={[
                styles.udhaarMiniAmount,
                { color: palette.giveTerracottaRed },
              ]}
            >
              {formatINR(summary?.totalPayablePaise || 0)}
            </Text>
          </View>
        </View>

        {personalUdhaarItems.map((friend) => (
          <TouchableOpacity
            key={friend.obligationId}
            onPress={() => onOpenContactDetail(friend.contactId)}
            style={[
              styles.friendRow,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.borderLatte,
              },
            ]}
          >
            <View>
              <Text style={[styles.friendName, { color: palette.textEspresso }]}>
                {friend.displayName}
              </Text>
              <Text style={[styles.friendNote, { color: palette.textMocha }]}>
                {friend.titleOrNote} • Due: {friend.dueDate}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text
                style={[
                  styles.friendAmount,
                  {
                    color:
                      friend.direction === 'RECEIVABLE'
                        ? palette.receiveSageGreen
                        : palette.giveTerracottaRed,
                  },
                ]}
              >
                {friend.direction === 'RECEIVABLE' ? '+' : '-'}
                {formatINR(friend.remainingPaise)}
              </Text>
              <Text
                style={[styles.tapChatHint, { color: palette.primaryBrown }]}
              >
                Open Chat Timeline →
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* 4. Monthly Category Budgets */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: palette.surfaceBeige,
            borderColor: palette.borderLatte,
          },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: palette.textEspresso }]}>
          📊 Monthly Category Budgets
        </Text>

        {budgets.length === 0 ? (
          <EmptyStateCard
            emoji="📊"
            title="No Monthly Budgets Configured Yet"
            message="Run /supabase/seed.sql or add category budgets to track your monthly spending limits."
          />
        ) : (
          budgets.map((b) => {
            const pct = Math.min(
              100,
              Math.round((b.spentPaise / b.limitPaise) * 100)
            );
            const isOverThreshold = pct >= b.alertThresholdPercent;
            const barColor = isOverThreshold
              ? palette.giveTerracottaRed
              : palette.primaryBrown;

            return (
              <View key={b.id} style={styles.budgetItem}>
                <View style={styles.budgetHeaderRow}>
                  <Text
                    style={[styles.budgetName, { color: palette.textEspresso }]}
                  >
                    {b.categoryName}
                  </Text>
                  <Text
                    style={[
                      styles.budgetNumbers,
                      {
                        color: isOverThreshold
                          ? palette.giveTerracottaRed
                          : palette.textMocha,
                      },
                    ]}
                  >
                    {formatINR(b.spentPaise)} / {formatINR(b.limitPaise)} ({pct}%)
                  </Text>
                </View>

                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: palette.pillInactiveBg },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${pct}%`,
                        backgroundColor: barColor,
                      },
                    ]}
                  />
                </View>

                {isOverThreshold && (
                  <Text
                    style={[
                      styles.budgetAlertText,
                      { color: palette.giveTerracottaRed },
                    ]}
                  >
                    ⚠️ Alert: {pct}% budget used (Crossed{' '}
                    {b.alertThresholdPercent}% limit)
                  </Text>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* 5. Recent Transactions List (With Empty State) */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: palette.surfaceBeige,
            borderColor: palette.borderLatte,
          },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: palette.textEspresso }]}>
          🧾 Recent Transactions
        </Text>

        {recentTransactions.length === 0 ? (
          <EmptyStateCard
            emoji="🎙️"
            title="No Transactions Recorded Yet"
            message="Tap the button below or use the mic to record your first personal expense or income!"
            actionLabel="+ Add First Transaction"
            onActionPress={() => setShowAddModal(true)}
          />
        ) : (
          recentTransactions.map((tx) => (
            <View
              key={tx.id}
              style={[
                styles.txRow,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.borderLatte,
                },
              ]}
            >
              <View style={styles.txLeft}>
                <View
                  style={[
                    styles.txIconBox,
                    { backgroundColor: palette.surfaceBeige },
                  ]}
                >
                  <Text style={styles.txEmoji}>🧾</Text>
                </View>
                <View>
                  <Text
                    style={[styles.txMerchant, { color: palette.textEspresso }]}
                  >
                    {tx.merchantOrPayee}
                  </Text>
                  <Text style={[styles.txMeta, { color: palette.textMocha }]}>
                    {tx.categoryName} • {tx.paymentVia}
                  </Text>
                </View>
              </View>

              <Text
                style={[
                  styles.txAmount,
                  {
                    color:
                      tx.kind === 'INCOME'
                        ? palette.receiveSageGreen
                        : palette.giveTerracottaRed,
                  },
                ]}
              >
                {tx.kind === 'INCOME' ? '+' : '-'}
                {formatINR(tx.amountPaise)}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Modal: Add Expense / Income via useCreateTransaction Mutation */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: palette.surfaceBeige,
                borderColor: palette.borderLatte,
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: palette.textEspresso }]}>
              Add Personal Entry
            </Text>

            <View style={styles.kindToggleRow}>
              {(['EXPENSE', 'INCOME'] as TransactionKind[]).map((k) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setTxKind(k)}
                  style={[
                    styles.kindBtn,
                    {
                      backgroundColor:
                        txKind === k
                          ? palette.primaryBrown
                          : palette.surfaceElevated,
                      borderColor: palette.borderLatte,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontWeight: '700',
                      fontSize: 13,
                      color:
                        txKind === k
                          ? palette.textOnPrimary
                          : palette.textEspresso,
                    }}
                  >
                    {k === 'EXPENSE'
                      ? '💸 Kharcha (Expense)'
                      : '💰 Kamaai (Income)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: palette.textEspresso }]}>
              Amount (in ₹ Rupees)
            </Text>
            <TextInput
              value={amountRupees}
              onChangeText={setAmountRupees}
              placeholder="Enter amount"
              keyboardType="numeric"
              placeholderTextColor={palette.textMocha}
              style={[
                styles.input,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.borderLatte,
                  color: palette.textEspresso,
                },
              ]}
            />

            <Text style={[styles.inputLabel, { color: palette.textEspresso }]}>
              Merchant / Payee
            </Text>
            <TextInput
              value={merchant}
              onChangeText={setMerchant}
              placeholder="Enter merchant or payee name"
              placeholderTextColor={palette.textMocha}
              style={[
                styles.input,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.borderLatte,
                  color: palette.textEspresso,
                },
              ]}
            />

            <Text style={[styles.inputLabel, { color: palette.textEspresso }]}>
              Category Name
            </Text>
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder="Category name"
              placeholderTextColor={palette.textMocha}
              style={[
                styles.input,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.borderLatte,
                  color: palette.textEspresso,
                },
              ]}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                style={[
                  styles.cancelBtn,
                  { borderColor: palette.borderLatte },
                ]}
              >
                <Text style={{ color: palette.textMocha, fontWeight: '700' }}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveTransaction}
                disabled={createTxMutation.isPending}
                style={[
                  styles.saveBtn,
                  { backgroundColor: palette.primaryBrown },
                ]}
              >
                <Text
                  style={{ color: palette.textOnPrimary, fontWeight: '800' }}
                >
                  {createTxMutation.isPending
                    ? 'Saving...'
                    : '✅ Confirm & Save'}
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
    padding: 16,
    paddingBottom: 110,
    gap: 14,
  },
  summaryCard: {
    borderRadius: 18,
    padding: 18,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  summaryMonthText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  quickAddBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  quickAddBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  summaryMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricBlock: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 23,
    fontWeight: '800',
  },
  metricDivider: {
    width: 1,
    height: 40,
    marginHorizontal: 14,
  },
  savingsFooter: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  savingsText: {
    fontSize: 12,
  },
  upiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  upiBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  upiBellIcon: {
    fontSize: 22,
  },
  upiBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  upiBannerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  upiArrow: {
    fontSize: 18,
    fontWeight: '800',
  },
  sectionCard: {
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  udhaarSplitRow: {
    flexDirection: 'row',
    gap: 10,
  },
  udhaarMiniBox: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  udhaarMiniLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  udhaarMiniAmount: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  friendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  friendName: {
    fontSize: 13,
    fontWeight: '700',
  },
  friendNote: {
    fontSize: 11,
    marginTop: 2,
  },
  friendAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  tapChatHint: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  budgetItem: {
    marginTop: 4,
  },
  budgetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  budgetName: {
    fontSize: 13,
    fontWeight: '700',
  },
  budgetNumbers: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 9,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  budgetAlertText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  txIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txEmoji: {
    fontSize: 18,
  },
  txMerchant: {
    fontSize: 13,
    fontWeight: '700',
  },
  txMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(44, 30, 22, 0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    borderTopWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  kindToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  kindBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
});
