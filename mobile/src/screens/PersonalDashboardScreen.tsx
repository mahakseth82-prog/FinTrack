import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
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
  onTriggerVoice?: () => void;
  isRecordingVoice?: boolean;
}

type SubNavTab = 'TRANSACTIONS' | 'INSIGHTS' | 'BUDGETS' | 'REPORTS';

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
  onTriggerVoice,
  isRecordingVoice = false,
}) => {
  const { activeWorkspaceId } = useFinTrackTheme();

  // Sub-nav tab state: Transactions | Insights | Budgets | Reports
  const [activeSubTab, setActiveSubTab] = useState<SubNavTab>('TRANSACTIONS');

  // Month navigation
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`;
  const [selectedMonthYear, setSelectedMonthYear] =
    useState<string>(currentMonthStr);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

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

  // Date-wise Grouping for Recent Transactions with Search
  const dateGroups = useMemo(() => {
    let list = allTransactions;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.merchantOrPayee.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.categoryName.toLowerCase().includes(q)
      );
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const groupMap = new Map<
      string,
      { dateKey: string; displayHeader: string; dailySpentPaise: number; items: TransactionDto[] }
    >();

    for (const t of list) {
      const dateKey = new Date(t.occurredAt).toISOString().slice(0, 10);
      const prev = groupMap.get(dateKey) || {
        dateKey,
        displayHeader: '',
        dailySpentPaise: 0,
        items: [],
      };

      prev.items.push(t);
      if (t.kind === 'EXPENSE') {
        prev.dailySpentPaise += Number(t.amountPaise);
      }
      groupMap.set(dateKey, prev);
    }

    return Array.from(groupMap.values())
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .map((g) => {
        const d = new Date(g.dateKey);
        const day = d.getDate();
        const monthShort = MONTH_NAMES[d.getMonth()]?.slice(0, 3) || '';

        let header = `${day} ${monthShort.toUpperCase()}`;
        if (g.dateKey === todayStr) {
          header = `TODAY — ${day} ${MONTH_NAMES[d.getMonth()]}`;
        } else if (g.dateKey === yesterdayStr) {
          header = `YESTERDAY — ${day} ${MONTH_NAMES[d.getMonth()]}`;
        }

        return {
          ...g,
          displayHeader: header,
        };
      });
  }, [allTransactions, searchQuery]);

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

  const handleSubTabSelect = (tab: SubNavTab) => {
    setActiveSubTab(tab);
    if (tab === 'INSIGHTS') {
      onNavigateToTab?.('INSIGHTS');
    } else if (tab === 'TRANSACTIONS') {
      onNavigateToTab?.('TRANSACTIONS');
    }
  };

  return (
    <View style={styles.screenWrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Compact Search Bar */}
        <View style={styles.searchBarBox}>
          <Ionicons name="search-outline" size={17} color="#94A3B8" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search transactions, merchants, notes..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle-outline" size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* 2. Clean, Uncolored Sub-Nav Tab Strip (Paytm-style clean tabs) */}
        <View style={styles.subNavStrip}>
          {(['TRANSACTIONS', 'INSIGHTS', 'BUDGETS', 'REPORTS'] as SubNavTab[]).map(
            (tab) => {
              const isSelected = activeSubTab === tab;
              const label =
                tab === 'TRANSACTIONS'
                  ? 'Transactions'
                  : tab === 'INSIGHTS'
                  ? 'Insights'
                  : tab === 'BUDGETS'
                  ? 'Budgets'
                  : 'Reports';

              return (
                <TouchableOpacity
                  key={tab}
                  activeOpacity={0.7}
                  onPress={() => handleSubTabSelect(tab)}
                  style={[styles.subNavItem, isSelected && styles.subNavItemActive]}
                >
                  <Text
                    style={[
                      styles.subNavText,
                      isSelected && styles.subNavTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                  {isSelected && <View style={styles.subNavIndicator} />}
                </TouchableOpacity>
              );
            }
          )}
        </View>

        {/* 3. Monthly Spending Summary Card */}
        <View style={styles.heroBudgetCard}>
          {/* Card Header with Month Navigation */}
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.heroSubLabel}>MONTHLY SPENDING</Text>
              <Text style={styles.monthSelectorTitle}>{monthLabel}</Text>
            </View>

            <View style={styles.monthControls}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handlePrevMonth}
                style={styles.monthArrowBtn}
              >
                <Ionicons name="chevron-back" size={15} color="#0F172A" />
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleNextMonth}
                style={styles.monthArrowBtn}
              >
                <Ionicons name="chevron-forward" size={15} color="#0F172A" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Amount & Badge */}
          <View style={styles.heroAmountRow}>
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

          {/* Horizontal Progress Bar */}
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
              <Text style={styles.statLabel}>Total Budget</Text>
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

        {/* 4. Recent Spends List (Date-Wise) */}
        <View style={styles.recentSectionCard}>
          <View style={styles.recentHeaderRow}>
            <View>
              <Text style={styles.recentSectionTitle}>Recent Transactions</Text>
              <Text style={styles.recentSectionSubtitle}>Latest date-wise spends</Text>
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

          {transactionsQuery.isLoading && allTransactions.length === 0 ? (
            <SkeletonLoader count={3} height={65} />
          ) : dateGroups.length === 0 ? (
            <EmptyStateCard
              title="No Transactions Found"
              message={
                searchQuery
                  ? `No transactions matching "${searchQuery}".`
                  : 'Use the buttons at the bottom to record your first transaction!'
              }
            />
          ) : (
            dateGroups.slice(0, 4).map((group) => (
              <View key={group.dateKey} style={styles.dateGroupContainer}>
                {/* Date Header Banner with Daily Total */}
                <View style={styles.dateGroupHeaderRow}>
                  <Text style={styles.dateGroupTitle}>{group.displayHeader}</Text>
                  <Text style={styles.dailySpentTotalText}>
                    Spent: -{formatINR(group.dailySpentPaise)}
                  </Text>
                </View>

                {group.items.map((item) => {
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
                })}
              </View>
            ))
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

      {/* 5. Bottom Large Pill Buttons (Pinned for Easy Thumb Reach) */}
      <View style={styles.bottomPillRow}>
        {/* Left Side: Scan Bill (Paytm Deep Royal Blue #002970) */}
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={handleScanBill}
          disabled={isScanningBill}
          style={styles.scanBillPill}
        >
          {isScanningBill ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="scan-outline" size={19} color="#FFFFFF" />
              <Text style={styles.scanBillPillText}>Scan Bill</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Right Side: Voice Entry (Vibrant Emerald Green #059669) */}
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onTriggerVoice}
          style={[
            styles.voicePill,
            isRecordingVoice && styles.voicePillRecording,
          ]}
        >
          <Ionicons
            name={isRecordingVoice ? 'radio-button-on' : 'mic'}
            size={19}
            color="#FFFFFF"
          />
          <Text style={styles.voicePillText}>
            {isRecordingVoice ? 'Listening...' : 'Voice Entry'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 95, // Space to scroll cleanly behind floating bottom pills
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
  },
  subNavStrip: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
    paddingTop: 2,
  },
  subNavItem: {
    paddingVertical: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
    position: 'relative',
  },
  subNavItemActive: {},
  subNavText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  subNavTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  subNavIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 6,
    right: 6,
    height: 2.5,
    backgroundColor: '#0F172A',
    borderRadius: 1.5,
  },
  heroBudgetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  heroSubLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  monthSelectorTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
    marginTop: 2,
  },
  monthControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monthArrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroAmountText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
  },
  budgetBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
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
    fontSize: 11,
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
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
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
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
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
    marginBottom: 12,
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
  dateGroupContainer: {
    marginBottom: 14,
  },
  dateGroupHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 4,
  },
  dateGroupTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  dailySpentTotalText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  transactionRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  txLeftBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
    marginRight: 10,
  },
  categoryCircleBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txMerchantName: {
    fontSize: 13,
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
    fontSize: 14,
    fontWeight: '800',
    fontFamily: SYSTEM_FONT_STACK,
  },
  tapToEditHint: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 1,
  },
  bottomPillRow: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    zIndex: 99,
  },
  scanBillPill: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#002970', // Paytm Deep Royal Blue
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#002970',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
  },
  scanBillPillText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  voicePill: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#059669', // Vibrant Emerald Green
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
  },
  voicePillRecording: {
    backgroundColor: '#DC2626',
  },
  voicePillText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
