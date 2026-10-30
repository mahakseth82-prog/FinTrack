import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import { SYSTEM_FONT_STACK, EMERALD_THEME } from '../theme/colors';
import { MinimalIcon } from '../components/MinimalIcon';
import {
  useDashboardSummary,
  useBudgets,
  useTransactions,
} from '../hooks/useFinTrackQueries';
import { TransactionDto } from '../types/ledger';
import { formatINR, paiseToRupees } from '../utils/paise';
import {
  SkeletonLoader,
  EmptyStateCard,
  ErrorRetryCard,
} from '../components/QueryStateViews';
import { TransactionDetailModal } from '../components/TransactionDetailModal';

interface PersonalDashboardProps {
  onOpenContactDetail?: (contactId: string) => void;
  onNavigateToTab?: (tabName: 'HOME' | 'TRANSACTIONS' | 'INSIGHTS' | 'UDHAAR' | 'PROFILE') => void;
}

interface DateGroupedTransactions {
  dateKey: string;
  displayHeader: string;
  dailySpentPaise: number;
  items: TransactionDto[];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const PersonalDashboardScreen: React.FC<PersonalDashboardProps> = ({
  onNavigateToTab,
}) => {
  const { palette, activeWorkspaceId } = useFinTrackTheme();

  // Current Month Selector (Default to current YYYY-MM)
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>(currentMonthStr);

  // Search & Category Filters for Section 3
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');

  // Chart View Toggle for Section 2
  const [chartViewMode, setChartViewMode] = useState<'CATEGORY' | 'WEEKLY'>('CATEGORY');

  // Selected Transaction for Detail / Edit / Delete Modal
  const [selectedTx, setSelectedTx] = useState<TransactionDto | null>(null);

  // Queries
  const summaryQuery = useDashboardSummary(activeWorkspaceId);
  const budgetsQuery = useBudgets(activeWorkspaceId, selectedMonthYear);
  const transactionsQuery = useTransactions(activeWorkspaceId, {
    monthYear: selectedMonthYear,
  });

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
    return transactionsQuery.data?.transactions || summaryQuery.data?.recentTransactions || [];
  }, [transactionsQuery.data, summaryQuery.data]);

  // Section 1 Computations (Total Spending, Total Budget, Remaining)
  const {
    totalBudgetPaise,
    totalExpensePaise,
    remainingBudgetPaise,
    budgetUsedPercent,
    progressBarColor,
  } = useMemo(() => {
    // Sum only EXPENSES for the selected month (EXCLUDE Income & Transfers)
    const expenseOnly = allTransactions.filter((t) => t.kind === 'EXPENSE');
    const spentPaise = expenseOnly.reduce((acc, t) => acc + Number(t.amountPaise), 0);

    // Sum monthly budget limits from backend
    const budgetList = budgetsQuery.data?.budgets || [];
    let budgetLimit = budgetList.reduce((acc, b) => acc + Number(b.limitPaise), 0);
    // Sensible default if no budgets are set yet for this month
    if (budgetLimit <= 0) {
      budgetLimit = 4000000; // ₹40,000 default
    }

    const remaining = Math.max(0, budgetLimit - spentPaise);
    const usedPercent = Math.min(100, Math.round((spentPaise / budgetLimit) * 100));

    let barColor = EMERALD_THEME.emeraldGreen; // < 80%
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

  // Section 2 Computations (Category breakdown & weekly distribution)
  const { categoryStats, topCategory, weeklyStats } = useMemo(() => {
    const expenses = allTransactions.filter((t) => t.kind === 'EXPENSE');
    const catMap = new Map<string, { name: string; amountPaise: number; icon: string }>();

    for (const t of expenses) {
      const name = t.categoryName || 'General';
      const prev = catMap.get(name) || { name, amountPaise: 0, icon: t.categoryIcon || 'food' };
      catMap.set(name, {
        name,
        amountPaise: prev.amountPaise + Number(t.amountPaise),
        icon: t.categoryIcon || prev.icon,
      });
    }

    const list = Array.from(catMap.values())
      .map((item) => ({
        ...item,
        percent:
          totalExpensePaise > 0
            ? Math.round((item.amountPaise / totalExpensePaise) * 100)
            : 0,
      }))
      .sort((a, b) => b.amountPaise - a.amountPaise);

    const highest = list.length > 0 ? list[0] : null;

    // 4 Weeks distribution
    const weeks = [
      { label: 'Week 1 (1-7)', amountPaise: 0 },
      { label: 'Week 2 (8-14)', amountPaise: 0 },
      { label: 'Week 3 (15-21)', amountPaise: 0 },
      { label: 'Week 4 (22+)', amountPaise: 0 },
    ];

    for (const t of expenses) {
      const day = new Date(t.occurredAt).getDate();
      if (day <= 7) weeks[0].amountPaise += Number(t.amountPaise);
      else if (day <= 14) weeks[1].amountPaise += Number(t.amountPaise);
      else if (day <= 21) weeks[2].amountPaise += Number(t.amountPaise);
      else weeks[3].amountPaise += Number(t.amountPaise);
    }

    return {
      categoryStats: list,
      topCategory: highest,
      weeklyStats: weeks,
    };
  }, [allTransactions, totalExpensePaise]);

  // Section 3 Computations (Date-wise grouping with search & filters)
  const dateGroups: DateGroupedTransactions[] = useMemo(() => {
    let filtered = allTransactions;

    // Apply search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (t) =>
          t.merchantOrPayee.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.categoryName.toLowerCase().includes(q)
      );
    }

    // Apply category pill filter
    if (selectedCategoryFilter !== 'ALL') {
      filtered = filtered.filter(
        (t) => t.categoryName.toLowerCase() === selectedCategoryFilter.toLowerCase()
      );
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const groupMap = new Map<string, { dateKey: string; dailySpentPaise: number; items: TransactionDto[] }>();

    for (const t of filtered) {
      const dateKey = new Date(t.occurredAt).toISOString().slice(0, 10);
      const prev = groupMap.get(dateKey) || { dateKey, dailySpentPaise: 0, items: [] };

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
          dateKey: g.dateKey,
          displayHeader: header,
          dailySpentPaise: g.dailySpentPaise,
          items: g.items,
        };
      });
  }, [allTransactions, searchQuery, selectedCategoryFilter]);

  // Unique category names for Section 3 filter pills
  const availableCategoryPills = useMemo(() => {
    const set = new Set<string>();
    allTransactions.forEach((t) => {
      if (t.categoryName) set.add(t.categoryName);
    });
    return ['ALL', ...Array.from(set)];
  }, [allTransactions]);

  const isLoading = summaryQuery.isLoading || transactionsQuery.isLoading;

  if (isLoading && allTransactions.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <SkeletonLoader count={4} height={90} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* =========================================================================
          MONTH SELECTOR HEADER
          ========================================================================= */}
      <View style={styles.monthHeaderRow}>
        <View>
          <Text style={styles.appWelcomeSubtitle}>Personal Finance Overview</Text>
          <Text style={styles.monthSelectorTitle}>{monthLabel}</Text>
        </View>

        <View style={styles.monthControls}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handlePrevMonth}
            style={styles.monthArrowBtn}
          >
            <MinimalIcon name="chevron-left" size={14} color="#0F172A" />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleNextMonth}
            style={styles.monthArrowBtn}
          >
            <MinimalIcon name="chevron-right" size={14} color="#0F172A" />
          </TouchableOpacity>
        </View>
      </View>

      {/* =========================================================================
          SECTION 1: Total Spending & Remaining Budget (Top Section)
          ========================================================================= */}
      <View style={styles.sectionContainer}>
        <View style={styles.budgetHeroCard}>
          {/* Top Row: Total Spending Hero + Budget Used Badge */}
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroSmallLabel}>TOTAL SPENDING THIS MONTH</Text>
              <Text style={styles.heroSpentText}>
                {formatINR(totalExpensePaise)}
              </Text>
            </View>

            <View style={[styles.percentBadge, { backgroundColor: '#ECFDF5' }]}>
              <Text style={[styles.percentBadgeText, { color: progressBarColor }]}>
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
                  width: `${budgetUsedPercent}%`,
                  backgroundColor: progressBarColor,
                },
              ]}
            />
          </View>

          {/* Bottom Metrics: Total Budget vs Remaining Budget */}
          <View style={styles.heroBottomRow}>
            <View style={styles.metricBlock}>
              <Text style={styles.metricLabel}>Total Monthly Budget</Text>
              <Text style={styles.metricValue}>
                {formatINR(totalBudgetPaise)}
              </Text>
            </View>

            <View style={[styles.metricBlock, { alignItems: 'flex-end' }]}>
              <Text style={styles.metricLabel}>Remaining Budget</Text>
              <Text style={[styles.metricValue, { color: EMERALD_THEME.emeraldGreen }]}>
                {formatINR(remainingBudgetPaise)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* =========================================================================
          SECTION 2: Monthly Spending Analytics & Graph ("Monthly Spending Insights")
          ========================================================================= */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionTitleRow}>
          <View>
            <Text style={styles.sectionHeading}>Monthly Spending Insights</Text>
            <Text style={styles.sectionSubheading}>Analytics & Category Breakdown</Text>
          </View>

          {/* View Mode Toggle: [ Categories | Weekly ] */}
          <View style={styles.chartToggleContainer}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setChartViewMode('CATEGORY')}
              style={[
                styles.chartToggleBtn,
                chartViewMode === 'CATEGORY' && styles.chartToggleBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.chartToggleText,
                  chartViewMode === 'CATEGORY' && styles.chartToggleTextActive,
                ]}
              >
                Categories
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setChartViewMode('WEEKLY')}
              style={[
                styles.chartToggleBtn,
                chartViewMode === 'WEEKLY' && styles.chartToggleBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.chartToggleText,
                  chartViewMode === 'WEEKLY' && styles.chartToggleTextActive,
                ]}
              >
                Weekly
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.insightsCard}>
          {/* Top Category Highlight Callout */}
          {topCategory && (
            <View style={styles.topCategoryCallout}>
              <View style={styles.topCategoryLeft}>
                <View style={[styles.categoryIconCircle, { backgroundColor: '#ECFDF5' }]}>
                  <MinimalIcon name="food" size={18} color="#059669" />
                </View>
                <View>
                  <Text style={styles.topCategoryPill}>HIGHEST SPENDING CATEGORY</Text>
                  <Text style={styles.topCategoryName}>{topCategory.name}</Text>
                </View>
              </View>
              <View style={styles.topCategoryRight}>
                <Text style={styles.topCategoryAmount}>
                  {formatINR(topCategory.amountPaise)}
                </Text>
                <Text style={styles.topCategoryPercent}>{topCategory.percent}% of total</Text>
              </View>
            </View>
          )}

          {/* Bar Chart comparing spending across Categories or Weeks */}
          <View style={styles.chartArea}>
            <Text style={styles.chartAreaTitle}>
              {chartViewMode === 'CATEGORY' ? 'Spending Comparison by Category' : 'Weekly Distribution'}
            </Text>

            {chartViewMode === 'CATEGORY' ? (
              <View style={styles.barChartWrapper}>
                {categoryStats.slice(0, 5).map((cat, idx) => {
                  const isTop = idx === 0;
                  return (
                    <View key={cat.name} style={styles.barItemCol}>
                      <Text style={styles.barAmountLabel}>{cat.percent}%</Text>
                      <View style={styles.barTrackVertical}>
                        <View
                          style={[
                            styles.barFillVertical,
                            {
                              height: `${Math.max(12, cat.percent)}%`,
                              backgroundColor: isTop ? '#059669' : '#94A3B8',
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.barXLabel, isTop && { color: '#059669', fontWeight: '700' }]} numberOfLines={1}>
                        {cat.name.split(' ')[0]}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.barChartWrapper}>
                {weeklyStats.map((w, idx) => {
                  const maxWeekly = Math.max(...weeklyStats.map((x) => x.amountPaise), 1);
                  const hPercent = Math.round((w.amountPaise / maxWeekly) * 100);
                  const isHighestWeek = w.amountPaise === maxWeekly && w.amountPaise > 0;
                  return (
                    <View key={w.label} style={styles.barItemCol}>
                      <Text style={styles.barAmountLabel}>
                        ₹{Math.round(paiseToRupees(w.amountPaise))}
                      </Text>
                      <View style={styles.barTrackVertical}>
                        <View
                          style={[
                            styles.barFillVertical,
                            {
                              height: `${Math.max(10, hPercent)}%`,
                              backgroundColor: isHighestWeek ? '#059669' : '#CBD5E1',
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.barXLabel}>W{idx + 1}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Category-wise Spending Breakdown List */}
          <View style={styles.categoryBreakdownList}>
            <Text style={styles.breakdownHeaderTitle}>Category Breakdown</Text>
            {categoryStats.length === 0 ? (
              <Text style={styles.emptyNote}>No expense entries recorded this month.</Text>
            ) : (
              categoryStats.map((c, i) => (
                <View key={c.name} style={styles.categoryItemRow}>
                  <View style={styles.categoryItemLeft}>
                    <View style={[styles.categoryIconSmall, i === 0 && { backgroundColor: '#ECFDF5' }]}>
                      <MinimalIcon name="food" size={14} color={i === 0 ? '#059669' : '#64748B'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.categoryNameRow}>
                        <Text style={[styles.categoryRowName, i === 0 && { fontWeight: '700' }]}>
                          {c.name}
                        </Text>
                        <Text style={styles.categoryRowAmount}>
                          {formatINR(c.amountPaise)}
                        </Text>
                      </View>
                      {/* Sub-bar */}
                      <View style={styles.subBarTrack}>
                        <View
                          style={[
                            styles.subBarFill,
                            {
                              width: `${c.percent}%`,
                              backgroundColor: i === 0 ? '#059669' : '#94A3B8',
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                  <Text style={styles.categoryRowPercent}>{c.percent}%</Text>
                </View>
              ))
            )}
          </View>
        </View>
      </View>

      {/* =========================================================================
          SECTION 3: Complete Spending / Transaction History (Date-wise)
          ========================================================================= */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionTitleRow}>
          <View>
            <Text style={styles.sectionHeading}>All Transactions</Text>
            <Text style={styles.sectionSubheading}>Date-wise Passbook & History</Text>
          </View>

          {onNavigateToTab && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => onNavigateToTab('TRANSACTIONS')}
              style={styles.viewAllBtn}
            >
              <Text style={styles.viewAllText}>View All →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Search Bar */}
        <View style={styles.searchBarBox}>
          <MinimalIcon name="search" size={16} color="#94A3B8" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by merchant, item or note..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MinimalIcon name="close" size={14} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Category Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPillsScroll}
        >
          {availableCategoryPills.map((cat) => {
            const isSelected = selectedCategoryFilter.toLowerCase() === cat.toLowerCase();
            return (
              <TouchableOpacity
                key={cat}
                activeOpacity={0.8}
                onPress={() => setSelectedCategoryFilter(cat)}
                style={[
                  styles.filterPill,
                  isSelected && {
                    backgroundColor: EMERALD_THEME.emeraldGreen,
                    borderColor: EMERALD_THEME.emeraldGreen,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    isSelected && { color: '#FFFFFF', fontWeight: '700' },
                  ]}
                >
                  {cat === 'ALL' ? 'All Categories' : cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Date-grouped Transactions List */}
        <View style={styles.transactionsCard}>
          {dateGroups.length === 0 ? (
            <View style={styles.emptyTransactionsBox}>
              <EmptyStateCard
                title="No Transactions Found"
                message={
                  searchQuery
                    ? `No transactions matching "${searchQuery}".`
                    : 'Tap the mic at the bottom to speak your first expense!'
                }
              />
            </View>
          ) : (
            dateGroups.map((group) => (
              <View key={group.dateKey} style={styles.dateGroupContainer}>
                {/* Date Group Header with Daily Total */}
                <View style={styles.dateGroupHeaderRow}>
                  <Text style={styles.dateGroupTitle}>{group.displayHeader}</Text>
                  <Text style={styles.dailySpentTotalText}>
                    Spent: -{formatINR(group.dailySpentPaise)}
                  </Text>
                </View>

                {/* Items in this date */}
                {group.items.map((item) => {
                  const isInc = item.kind === 'INCOME';
                  const formattedTime = new Date(item.occurredAt).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  });

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
                            {
                              backgroundColor: isInc ? '#ECFDF5' : '#F8FAFC',
                            },
                          ]}
                        >
                          <MinimalIcon
                            name={
                              item.categoryName.toLowerCase().includes('petrol')
                                ? 'travel'
                                : item.categoryName.toLowerCase().includes('grocery')
                                ? 'grocery'
                                : 'food'
                            }
                            size={16}
                            color={isInc ? '#059669' : '#0F172A'}
                          />
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.txMerchantName} numberOfLines={1}>
                            {item.merchantOrPayee}
                          </Text>
                          <Text style={styles.txMetaText}>
                            {item.categoryName} • {formattedTime} • {item.paymentVia || 'UPI'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.txRightBlock}>
                        <Text
                          style={[
                            styles.txAmountText,
                            {
                              color: isInc ? '#059669' : '#0F172A',
                            },
                          ]}
                        >
                          {isInc ? '+' : '-'}{formatINR(item.amountPaise)}
                        </Text>
                        <Text style={styles.tapToEditHint}>Tap to edit / delete</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </View>
      </View>

      {/* Transaction Detail, Edit & Delete Modal */}
      <TransactionDetailModal
        visible={Boolean(selectedTx)}
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        workspaceId={activeWorkspaceId}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 110,
  },
  centerContainer: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  monthHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  appWelcomeSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  monthSelectorTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
    marginTop: 2,
  },
  monthControls: {
    flexDirection: 'row',
    gap: 8,
  },
  monthArrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionContainer: {
    marginBottom: 22,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
  },
  sectionSubheading: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  viewAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  budgetHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  heroSmallLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  heroSpentText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  percentBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  percentBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  progressBarTrack: {
    height: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  heroBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  metricBlock: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
    marginTop: 2,
  },
  chartToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 2,
  },
  chartToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chartToggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  chartToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  chartToggleTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  insightsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  topCategoryCallout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  topCategoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topCategoryPill: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  topCategoryName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  topCategoryRight: {
    alignItems: 'flex-end',
  },
  topCategoryAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#059669',
  },
  topCategoryPercent: {
    fontSize: 11,
    color: '#64748B',
  },
  chartArea: {
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 16,
  },
  chartAreaTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 14,
  },
  barChartWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 120,
    paddingTop: 10,
  },
  barItemCol: {
    alignItems: 'center',
    flex: 1,
  },
  barAmountLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 4,
  },
  barTrackVertical: {
    width: 20,
    height: 80,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFillVertical: {
    width: '100%',
    borderRadius: 6,
  },
  barXLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
    maxWidth: 55,
    textAlign: 'center',
  },
  categoryBreakdownList: {},
  breakdownHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 12,
  },
  emptyNote: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 12,
  },
  categoryItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  categoryItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
    marginRight: 12,
  },
  categoryIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  categoryRowName: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  categoryRowAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  subBarTrack: {
    height: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  subBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  categoryRowPercent: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    width: 36,
    textAlign: 'right',
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
  },
  filterPillsScroll: {
    paddingBottom: 10,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  transactionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyTransactionsBox: {
    paddingVertical: 20,
  },
  dateGroupContainer: {
    marginBottom: 14,
  },
  dateGroupHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    marginBottom: 6,
  },
  dateGroupTitle: {
    fontSize: 12,
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
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  txLeftBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
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
