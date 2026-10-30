import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFinTrackTheme } from '../context/ThemeContext';
import { SYSTEM_FONT_STACK, EMERALD_THEME } from '../theme/colors';
import {
  useDashboardSummary,
  useBudgets,
  useTransactions,
  useScanBillOcr,
} from '../hooks/useFinTrackQueries';
import { TransactionDto } from '../types/ledger';
import { formatINR } from '../utils/paise';
import { SkeletonLoader, EmptyStateCard } from '../components/QueryStateViews';
import { TransactionDetailModal } from '../components/TransactionDetailModal';
import { ManualTransactionModal } from '../components/ManualTransactionModal';

interface PersonalDashboardProps {
  onOpenContactDetail?: (contactId: string) => void;
  onNavigateToTab?: (
    tabName: 'HOME' | 'TRANSACTIONS' | 'INSIGHTS' | 'UDHAAR' | 'PROFILE'
  ) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getCategoryIconName(
  categoryName: string,
  isIncome: boolean
): keyof typeof Ionicons.glyphMap {
  if (isIncome) return 'arrow-down-circle-outline';
  const cat = (categoryName || '').toLowerCase();
  if (
    cat.includes('food') ||
    cat.includes('chai') ||
    cat.includes('dining') ||
    cat.includes('restaurant') ||
    cat.includes('dinner') ||
    cat.includes('snack')
  ) {
    return 'restaurant-outline';
  }
  if (
    cat.includes('travel') ||
    cat.includes('petrol') ||
    cat.includes('fuel') ||
    cat.includes('transport') ||
    cat.includes('auto') ||
    cat.includes('metro')
  ) {
    return 'car-outline';
  }
  if (
    cat.includes('grocery') ||
    cat.includes('rashan') ||
    cat.includes('supermarket') ||
    cat.includes('dmart') ||
    cat.includes('dairy') ||
    cat.includes('milk')
  ) {
    return 'basket-outline';
  }
  if (
    cat.includes('cloth') ||
    cat.includes('shopping') ||
    cat.includes('kapde') ||
    cat.includes('myntra') ||
    cat.includes('amazon')
  ) {
    return 'shirt-outline';
  }
  if (
    cat.includes('bill') ||
    cat.includes('recharge') ||
    cat.includes('electric') ||
    cat.includes('utility')
  ) {
    return 'receipt-outline';
  }
  return 'wallet-outline';
}

export const PersonalDashboardScreen: React.FC<PersonalDashboardProps> = ({
  onNavigateToTab,
}) => {
  const { activeWorkspaceId } = useFinTrackTheme();

  // Current Month Selector (Default to current YYYY-MM)
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`;
  const [selectedMonthYear, setSelectedMonthYear] =
    useState<string>(currentMonthStr);

  // Selected Transaction for Detail / Edit / Delete Modal
  const [selectedTx, setSelectedTx] = useState<TransactionDto | null>(null);

  // Manual Add & Bill Scan State
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [prefillValues, setPrefillValues] = useState<{
    amountRupees?: number;
    merchantOrPayee?: string;
    categoryName?: string;
    kind?: 'EXPENSE' | 'INCOME';
  } | undefined>(undefined);
  const [isScanningBill, setIsScanningBill] = useState(false);

  // Queries & Mutations
  const summaryQuery = useDashboardSummary(activeWorkspaceId);
  const budgetsQuery = useBudgets(activeWorkspaceId, selectedMonthYear);
  const transactionsQuery = useTransactions(activeWorkspaceId, {
    monthYear: selectedMonthYear,
  });
  const scanBillMutation = useScanBillOcr(activeWorkspaceId);

  // Calculate Month Navigation
  const [yearNum, monthNum] = selectedMonthYear.split('-').map(Number);
  const monthLabel = `${MONTH_NAMES[monthNum - 1]} ${yearNum}`;

  const handlePrevMonth = () => {
    let newM = monthNum - 1;
    let newY = yearNum;
    if (newM < 1) {
      newM = 12;
      newY -= 1;
    }
    setSelectedMonthYear(`${newY}-${String(newM).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    let newM = monthNum + 1;
    let newY = yearNum;
    if (newM > 12) {
      newM = 1;
      newY += 1;
    }
    setSelectedMonthYear(`${newY}-${String(newM).padStart(2, '0')}`);
  };

  // Real Transactions from Backend
  const allTransactions: TransactionDto[] = useMemo(() => {
    return (
      transactionsQuery.data?.transactions ||
      summaryQuery.data?.recentTransactions ||
      []
    );
  }, [transactionsQuery.data, summaryQuery.data]);

  // Section 1 Computations (Total Spending, Total Budget, Remaining)
  const {
    totalBudgetPaise,
    totalExpensePaise,
    remainingBudgetPaise,
    budgetUsedPercent,
    progressBarColor,
  } = useMemo(() => {
    const expenseOnly = allTransactions.filter((t) => t.kind === 'EXPENSE');
    const spentPaise = expenseOnly.reduce(
      (acc, t) => acc + Number(t.amountPaise),
      0
    );

    const budgetList = budgetsQuery.data?.budgets || [];
    let budgetLimit = budgetList.reduce(
      (acc, b) => acc + Number(b.limitPaise),
      0
    );
    if (budgetLimit <= 0) {
      budgetLimit = 4000000; // ₹40,000 default if not configured
    }

    const remaining = Math.max(0, budgetLimit - spentPaise);
    const usedPercent = Math.min(
      100,
      Math.round((spentPaise / budgetLimit) * 100)
    );

    let barColor = EMERALD_THEME.emeraldGreen;
    if (usedPercent >= 100) {
      barColor = EMERALD_THEME.alertRed;
    } else if (usedPercent >= 80) {
      barColor = EMERALD_THEME.warningOrange;
    }

    return {
      totalBudgetPaise: budgetLimit,
      totalExpensePaise: spentPaise,
      remainingBudgetPaise: remaining,
      budgetUsedPercent: usedPercent,
      progressBarColor: barColor,
    };
  }, [allTransactions, budgetsQuery.data]);

  // Latest 5 Transactions for Recent Spends List
  const recentSpends = useMemo(() => {
    return [...allTransactions]
      .sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
      )
      .slice(0, 5);
  }, [allTransactions]);

  const handleScanBill = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      const res = perm.granted
        ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({
            base64: true,
            quality: 0.7,
          });

      if (res.canceled || !res.assets?.[0]?.base64) return;

      setIsScanningBill(true);
      const ocrResult = await scanBillMutation.mutateAsync({
        imageBase64: res.assets[0].base64,
        mimeType: res.assets[0].mimeType || 'image/jpeg',
      });
      setIsScanningBill(false);

      if (ocrResult?.draft) {
        setPrefillValues({
          amountRupees: ocrResult.draft.extractedAmountRupees || undefined,
          merchantOrPayee:
            ocrResult.draft.extractedContactName ||
            ocrResult.draft.normalizedTitle ||
            '',
          categoryName:
            ocrResult.draft.extractedCategoryName || 'Bills & Utilities',
          kind: 'EXPENSE',
        });
        setIsManualModalOpen(true);
      } else {
        Alert.alert(
          'Bill Scanned',
          'Receipt scanned and entry saved to ledger!'
        );
      }
    } catch (err: unknown) {
      setIsScanningBill(false);
      const msg = err instanceof Error ? err.message : 'Failed to scan bill';
      Alert.alert('Scan Failed', msg);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Overview Header Row */}
      <View style={styles.sectionHeaderRow}>
        <View>
          <Text style={styles.sectionOverline}>Personal Finance Overview</Text>
          <Text style={styles.monthSelectorTitle}>{monthLabel}</Text>
        </View>

        <View style={styles.monthControls}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handlePrevMonth}
            style={styles.monthArrowBtn}
          >
            <Ionicons name="chevron-back" size={16} color="#0F172A" />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleNextMonth}
            style={styles.monthArrowBtn}
          >
            <Ionicons name="chevron-forward" size={16} color="#0F172A" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Reordered: Action Buttons (Scan Bill & Manual Add) ABOVE Overview Card */}
      <View style={styles.actionRowContainer}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleScanBill}
          disabled={isScanningBill}
          style={styles.actionBtnOutline}
        >
          {isScanningBill ? (
            <ActivityIndicator size="small" color="#059669" />
          ) : (
            <>
              <Ionicons name="camera-outline" size={18} color="#059669" />
              <Text style={styles.actionBtnTextGreen}>Scan Bill</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            setPrefillValues(undefined);
            setIsManualModalOpen(true);
          }}
          style={styles.actionBtnPrimary}
        >
          <Ionicons name="add" size={19} color="#FFFFFF" />
          <Text style={styles.actionBtnTextWhite}>Manual Add</Text>
        </TouchableOpacity>
      </View>

      {/* Hero Spending Card */}
      <View style={styles.heroBudgetCard}>
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.heroSubLabel}>TOTAL SPENDING THIS MONTH</Text>
            {transactionsQuery.isLoading && allTransactions.length === 0 ? (
              <ActivityIndicator
                size="small"
                color="#059669"
                style={{ alignSelf: 'flex-start', marginVertical: 8 }}
              />
            ) : (
              <Text style={styles.heroAmountText}>
                {formatINR(totalExpensePaise)}
              </Text>
            )}
          </View>

          <View
            style={[
              styles.budgetBadge,
              budgetUsedPercent >= 100
                ? styles.badgeAlert
                : budgetUsedPercent >= 80
                ? styles.badgeWarning
                : styles.badgeNormal,
            ]}
          >
            <Text
              style={[
                styles.budgetBadgeText,
                budgetUsedPercent >= 100
                  ? styles.badgeTextAlert
                  : budgetUsedPercent >= 80
                  ? styles.badgeTextWarning
                  : styles.badgeTextNormal,
              ]}
            >
              {budgetUsedPercent}% Used
            </Text>
          </View>
        </View>

        {/* Clean Horizontal Progress Bar */}
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.min(100, Math.max(2, budgetUsedPercent))}%`,
                backgroundColor: progressBarColor,
              },
            ]}
          />
        </View>

        {/* Budget Comparison Sub-Row */}
        <View style={styles.budgetStatsRow}>
          <View>
            <Text style={styles.statLabel}>Total Monthly Budget</Text>
            <Text style={styles.statValue}>
              {formatINR(totalBudgetPaise)}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.statLabel}>Remaining Budget</Text>
            <Text
              style={[
                styles.statValue,
                {
                  color:
                    remainingBudgetPaise <= 0
                      ? EMERALD_THEME.alertRed
                      : EMERALD_THEME.emeraldGreen,
                },
              ]}
            >
              {formatINR(remainingBudgetPaise)}
            </Text>
          </View>
        </View>
      </View>

      {/* Recent Spends List (Latest 5 Transactions) - Sits directly below Total Spending Card */}
      <View style={styles.recentSectionCard}>
        <View style={styles.recentHeaderRow}>
          <View>
            <Text style={styles.recentSectionTitle}>Recent Transactions</Text>
            <Text style={styles.recentSectionSubtitle}>Latest spends</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onNavigateToTab?.('TRANSACTIONS')}
            style={styles.seeAllBtn}
          >
            <Text style={styles.seeAllBtnText}>See All</Text>
            <Ionicons name="chevron-forward" size={13} color="#059669" />
          </TouchableOpacity>
        </View>

        {transactionsQuery.isLoading && recentSpends.length === 0 ? (
          <SkeletonLoader count={3} height={60} />
        ) : recentSpends.length === 0 ? (
          <EmptyStateCard
            title="No Recent Transactions"
            message="Tap the mic below or add a transaction to get started!"
          />
        ) : (
          recentSpends.map((item) => {
            const isInc = item.kind === 'INCOME';
            const formattedTime = new Date(item.occurredAt).toLocaleTimeString(
              'en-IN',
              {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              }
            );

            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.7}
                onPress={() => setSelectedTx(item)}
                style={styles.transactionRowItem}
              >
                <View style={styles.txLeftBlock}>
                  <View
                    style={[
                      styles.categoryCircleBadge,
                      { backgroundColor: isInc ? '#ECFDF5' : '#F1F5F9' },
                    ]}
                  >
                    <Ionicons
                      name={getCategoryIconName(item.categoryName, isInc)}
                      size={18}
                      color={isInc ? '#059669' : '#334155'}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.txMerchantName} numberOfLines={1}>
                      {item.merchantOrPayee}
                    </Text>
                    <Text style={styles.txMetaText}>
                      {item.categoryName} • {formattedTime} •{' '}
                      {item.paymentVia || 'UPI'}
                    </Text>
                  </View>
                </View>

                <View style={styles.txRightBlock}>
                  <Text
                    style={[
                      styles.txAmountText,
                      { color: isInc ? '#059669' : '#0F172A' },
                    ]}
                  >
                    {isInc ? '+' : '-'}
                    {formatINR(item.amountPaise)}
                  </Text>
                  <Text style={styles.tapToEditHint}>Tap to view/edit</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Detail / Edit / Delete Modal */}
      {selectedTx && (
        <TransactionDetailModal
          visible={Boolean(selectedTx)}
          transaction={selectedTx}
          onClose={() => setSelectedTx(null)}
        />
      )}

      {/* Manual Entry Modal */}
      <ManualTransactionModal
        visible={isManualModalOpen}
        onClose={() => {
          setIsManualModalOpen(false);
          setPrefillValues(undefined);
        }}
        initialValues={prefillValues}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 110,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionOverline: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  monthSelectorTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
  },
  monthControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBudgetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  heroSubLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  heroAmountText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 4,
    fontFamily: SYSTEM_FONT_STACK,
  },
  budgetBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  badgeNormal: {
    backgroundColor: '#ECFDF5',
  },
  badgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  badgeAlert: {
    backgroundColor: '#FEE2E2',
  },
  budgetBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  badgeTextNormal: {
    color: '#059669',
  },
  badgeTextWarning: {
    color: '#D97706',
  },
  badgeTextAlert: {
    color: '#DC2626',
  },
  progressBarTrack: {
    height: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  budgetStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  actionRowContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  actionBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
  },
  actionBtnTextGreen: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#0F172A',
  },
  actionBtnTextWhite: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  recentSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  recentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  recentSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  recentSectionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  transactionRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  txLeftBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
    marginRight: 10,
  },
  categoryCircleBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txMerchantName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  txMetaText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  txRightBlock: {
    alignItems: 'flex-end',
  },
  txAmountText: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: SYSTEM_FONT_STACK,
  },
  tapToEditHint: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 2,
  },
});
