import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import { SYSTEM_FONT_STACK, EMERALD_THEME } from '../theme/colors';
import { MinimalIcon } from '../components/MinimalIcon';
import { useTransactions, useBudgets } from '../hooks/useFinTrackQueries';
import { TransactionDto } from '../types/ledger';
import { formatINR, paiseToRupees } from '../utils/paise';
import { SkeletonLoader } from '../components/QueryStateViews';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const InsightsScreen: React.FC = () => {
  const { activeWorkspaceId } = useFinTrackTheme();

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>(currentMonthStr);
  const [chartViewMode, setChartViewMode] = useState<'CATEGORY' | 'WEEKLY'>('CATEGORY');

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

  const { data: txData, isLoading: txLoading } = useTransactions(activeWorkspaceId, {
    monthYear: selectedMonthYear,
  });

  const { data: budgetData } = useBudgets(activeWorkspaceId, selectedMonthYear);

  const transactions = txData?.transactions || [];

  const { totalExpensePaise, categoryStats, topCategory, weeklyStats, dailyAveragePaise } = useMemo(() => {
    const expenses = transactions.filter((t: TransactionDto) => t.kind === 'EXPENSE');
    const totalSpent = expenses.reduce<number>((acc, t) => acc + Number(t.amountPaise), 0);

    const catMap = new Map<string, { name: string; amountPaise: number }>();
    for (const t of expenses) {
      const name = t.categoryName || 'General';
      const prev = catMap.get(name) || { name, amountPaise: 0 };
      catMap.set(name, {
        name,
        amountPaise: prev.amountPaise + Number(t.amountPaise),
      });
    }

    const list = Array.from(catMap.values())
      .map((item) => ({
        ...item,
        percent: totalSpent > 0 ? Math.round((item.amountPaise / totalSpent) * 100) : 0,
      }))
      .sort((a, b) => b.amountPaise - a.amountPaise);

    const highest = list.length > 0 ? list[0] : null;

    const weeks = [
      { label: 'Week 1', amountPaise: 0 },
      { label: 'Week 2', amountPaise: 0 },
      { label: 'Week 3', amountPaise: 0 },
      { label: 'Week 4', amountPaise: 0 },
    ];

    for (const t of expenses) {
      const day = new Date(t.occurredAt).getDate();
      if (day <= 7) weeks[0].amountPaise += Number(t.amountPaise);
      else if (day <= 14) weeks[1].amountPaise += Number(t.amountPaise);
      else if (day <= 21) weeks[2].amountPaise += Number(t.amountPaise);
      else weeks[3].amountPaise += Number(t.amountPaise);
    }

    const daysCount = Math.max(1, new Date().getDate());
    const dailyAvg = Math.round(totalSpent / daysCount);

    return {
      totalExpensePaise: totalSpent,
      categoryStats: list,
      topCategory: highest,
      weeklyStats: weeks,
      dailyAveragePaise: dailyAvg,
    };
  }, [transactions]);

  // Comprehensive Monthly Budget & Progress Calculations
  const { totalBudgetPaise, remainingBudgetPaise, budgetUsedPercent, progressBarColor } = useMemo(() => {
    const budgetList = budgetData?.budgets || [];
    let budgetLimit = budgetList.reduce(
      (acc, b) => acc + Number(b.limitPaise),
      0
    );
    if (budgetLimit <= 0) {
      budgetLimit = 4000000; // ₹40,000 default if not configured
    }

    const remaining = Math.max(0, budgetLimit - totalExpensePaise);
    const usedPercent = Math.min(
      100,
      Math.round((totalExpensePaise / budgetLimit) * 100)
    );

    let barColor = EMERALD_THEME.emeraldGreen;
    if (usedPercent >= 100) {
      barColor = EMERALD_THEME.alertRed;
    } else if (usedPercent >= 80) {
      barColor = EMERALD_THEME.warningOrange;
    }

    return {
      totalBudgetPaise: budgetLimit,
      remainingBudgetPaise: remaining,
      budgetUsedPercent: usedPercent,
      progressBarColor: barColor,
    };
  }, [budgetData?.budgets, totalExpensePaise]);

  if (txLoading && transactions.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <SkeletonLoader count={4} height={90} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Month Header */}
      <View style={styles.monthHeaderRow}>
        <View>
          <Text style={styles.screenLabel}>Spending Insights</Text>
          <Text style={styles.monthSelectorTitle}>{monthLabel}</Text>
        </View>

        <View style={styles.monthControls}>
          <TouchableOpacity activeOpacity={0.7} onPress={handlePrevMonth} style={styles.monthArrowBtn}>
            <MinimalIcon name="chevron-left" size={14} color="#0F172A" />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={handleNextMonth} style={styles.monthArrowBtn}>
            <MinimalIcon name="chevron-right" size={14} color="#0F172A" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 1. Comprehensive Total Monthly Spending Card */}
      <View style={styles.monthlySpendingCard}>
        <View style={styles.monthlyCardHeaderRow}>
          <View>
            <Text style={styles.monthlyCardSubLabel}>TOTAL MONTHLY SPENDING</Text>
            <Text style={styles.monthlyCardTitle}>{monthLabel}</Text>
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

        {/* Big Amount */}
        <Text style={styles.monthlyAmountText}>
          {formatINR(totalExpensePaise)}
        </Text>

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

        {/* Budget Stats Row */}
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

      {/* Summary KPI Cards */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Total Outflow</Text>
          <Text style={styles.kpiValue}>{formatINR(totalExpensePaise)}</Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Daily Average</Text>
          <Text style={[styles.kpiValue, { color: EMERALD_THEME.emeraldGreen }]}>
            {formatINR(dailyAveragePaise)}
          </Text>
        </View>
      </View>

      {/* Top Category Highlight Callout */}
      {topCategory && (
        <View style={styles.topCategoryCallout}>
          <View style={styles.topCategoryLeft}>
            <View style={[styles.categoryIconCircle, { backgroundColor: '#ECFDF5' }]}>
              <MinimalIcon name="food" size={20} color="#059669" />
            </View>
            <View>
              <Text style={styles.topCategoryPill}>HIGHEST SPENDING CATEGORY</Text>
              <Text style={styles.topCategoryName}>{topCategory.name}</Text>
            </View>
          </View>
          <View style={styles.topCategoryRight}>
            <Text style={styles.topCategoryAmount}>{formatINR(topCategory.amountPaise)}</Text>
            <Text style={styles.topCategoryPercent}>{topCategory.percent}% of total</Text>
          </View>
        </View>
      )}

      {/* Chart Section */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeaderRow}>
          <Text style={styles.chartTitle}>Spending Comparison</Text>
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
                Category
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

      {/* Category Breakdown Full List */}
      <View style={styles.breakdownCard}>
        <Text style={styles.breakdownHeading}>Category Breakdown</Text>
        {categoryStats.length === 0 ? (
          <Text style={styles.emptyNote}>No expenses recorded for this month.</Text>
        ) : (
          categoryStats.map((c, i) => (
            <View key={c.name} style={styles.categoryItemRow}>
              <View style={styles.categoryItemLeft}>
                <View style={[styles.categoryIconSmall, i === 0 && { backgroundColor: '#ECFDF5' }]}>
                  <MinimalIcon name="food" size={14} color={i === 0 ? '#059669' : '#64748B'} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.categoryNameRow}>
                    <Text style={[styles.categoryRowName, i === 0 && { fontWeight: '700' }]}>{c.name}</Text>
                    <Text style={styles.categoryRowAmount}>{formatINR(c.amountPaise)}</Text>
                  </View>
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
    paddingBottom: 100,
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
  screenLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  monthSelectorTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
  },
  monthControls: {
    flexDirection: 'row',
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
  monthlySpendingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  monthlyCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  monthlyCardSubLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  monthlyCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
    marginTop: 2,
  },
  monthlyAmountText: {
    fontSize: 30,
    fontWeight: '900',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
    fontVariant: ['tabular-nums'],
    marginBottom: 12,
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
    paddingTop: 10,
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
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
    marginTop: 4,
  },
  topCategoryCallout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  topCategoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topCategoryPill: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  topCategoryName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  topCategoryRight: {
    alignItems: 'flex-end',
  },
  topCategoryAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#059669',
  },
  topCategoryPercent: {
    fontSize: 11,
    color: '#64748B',
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
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
  barChartWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 130,
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
    width: 22,
    height: 90,
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
    maxWidth: 60,
    textAlign: 'center',
  },
  breakdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  breakdownHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 14,
  },
  emptyNote: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 14,
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
    width: 40,
    height: 40,
    borderRadius: 20,
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
});
