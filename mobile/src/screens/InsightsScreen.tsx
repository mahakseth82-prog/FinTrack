import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFinTrackTheme } from '../context/ThemeContext';
import { SYSTEM_FONT_STACK } from '../theme/colors';
import { useTransactions } from '../hooks/useFinTrackQueries';
import { TransactionDto } from '../types/ledger';
import { formatINR } from '../utils/paise';
import { SkeletonLoader } from '../components/QueryStateViews';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_SHORT = [
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

function getPastMonthStrings(monthYear: string): [string, string] {
  const [yearStr, monthStr] = monthYear.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // Month - 1
  let m1 = month - 1;
  let y1 = year;
  if (m1 < 1) {
    m1 = 12;
    y1 -= 1;
  }
  const prev1 = `${y1}-${String(m1).padStart(2, '0')}`;

  // Month - 2
  let m2 = m1 - 1;
  let y2 = y1;
  if (m2 < 1) {
    m2 = 12;
    y2 -= 1;
  }
  const prev2 = `${y2}-${String(m2).padStart(2, '0')}`;

  return [prev1, prev2];
}

function getCategoryTheme(name: string): {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
} {
  const lower = (name || '').toLowerCase();
  if (
    lower.includes('food') ||
    lower.includes('dining') ||
    lower.includes('restaurant') ||
    lower.includes('cafe')
  ) {
    return { icon: 'restaurant', color: '#D97706', bg: '#FEF3C7' };
  }
  if (
    lower.includes('shop') ||
    lower.includes('cloth') ||
    lower.includes('amazon') ||
    lower.includes('store')
  ) {
    return { icon: 'cart', color: '#7C3AED', bg: '#EDE9FE' };
  }
  if (
    lower.includes('travel') ||
    lower.includes('fuel') ||
    lower.includes('petrol') ||
    lower.includes('cab') ||
    lower.includes('uber')
  ) {
    return { icon: 'car', color: '#0284C7', bg: '#E0F2FE' };
  }
  if (
    lower.includes('bill') ||
    lower.includes('recharge') ||
    lower.includes('electric') ||
    lower.includes('utility')
  ) {
    return { icon: 'receipt', color: '#DC2626', bg: '#FEE2E2' };
  }
  if (
    lower.includes('grocer') ||
    lower.includes('ration') ||
    lower.includes('kirana') ||
    lower.includes('vegetable')
  ) {
    return { icon: 'basket', color: '#059669', bg: '#ECFDF5' };
  }
  if (
    lower.includes('entertain') ||
    lower.includes('movie') ||
    lower.includes('ott') ||
    lower.includes('netflix')
  ) {
    return { icon: 'film', color: '#DB2777', bg: '#FCE7F3' };
  }
  if (
    lower.includes('health') ||
    lower.includes('medical') ||
    lower.includes('doctor') ||
    lower.includes('pharmacy')
  ) {
    return { icon: 'medkit', color: '#E11D48', bg: '#FFE4E6' };
  }
  return { icon: 'pricetag', color: '#475569', bg: '#F1F5F9' };
}

export const InsightsScreen: React.FC = () => {
  const { activeWorkspaceId, palette } = useFinTrackTheme();

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`;
  const [selectedMonthYear, setSelectedMonthYear] =
    useState<string>(currentMonthStr);

  const [yearNum, monthNum] = selectedMonthYear.split('-').map(Number);
  const monthLabel = `${MONTH_NAMES[monthNum - 1]} ${yearNum}`;
  const currentMonthShortLabel = `${MONTH_SHORT[monthNum - 1]}`;

  const [prevMonth1Str, prevMonth2Str] = useMemo(
    () => getPastMonthStrings(selectedMonthYear),
    [selectedMonthYear]
  );

  const [, prev1MonthNum] = prevMonth1Str.split('-').map(Number);
  const prevMonth1Label = MONTH_SHORT[prev1MonthNum - 1];

  const [, prev2MonthNum] = prevMonth2Str.split('-').map(Number);
  const prevMonth2Label = MONTH_SHORT[prev2MonthNum - 1];

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

  // 1. Fetch current month transactions
  const { data: txDataCurrent, isLoading: loadingCurrent } = useTransactions(
    activeWorkspaceId,
    { monthYear: selectedMonthYear }
  );

  // 2. Fetch previous month transactions for dynamic 3-month comparison
  const { data: txDataPrev1 } = useTransactions(activeWorkspaceId, {
    monthYear: prevMonth1Str,
  });

  // 3. Fetch 2 months ago transactions for dynamic 3-month comparison
  const { data: txDataPrev2 } = useTransactions(activeWorkspaceId, {
    monthYear: prevMonth2Str,
  });

  const currentExpenses = useMemo(() => {
    return (txDataCurrent?.transactions || []).filter(
      (t: TransactionDto) => t.kind === 'EXPENSE'
    );
  }, [txDataCurrent?.transactions]);

  const prev1Expenses = useMemo(() => {
    return (txDataPrev1?.transactions || []).filter(
      (t: TransactionDto) => t.kind === 'EXPENSE'
    );
  }, [txDataPrev1?.transactions]);

  const prev2Expenses = useMemo(() => {
    return (txDataPrev2?.transactions || []).filter(
      (t: TransactionDto) => t.kind === 'EXPENSE'
    );
  }, [txDataPrev2?.transactions]);

  const currentSpentPaise = useMemo(() => {
    return currentExpenses.reduce(
      (sum: number, t: TransactionDto) => sum + Number(t.amountPaise),
      0
    );
  }, [currentExpenses]);

  const prev1SpentPaise = useMemo(() => {
    return prev1Expenses.reduce(
      (sum: number, t: TransactionDto) => sum + Number(t.amountPaise),
      0
    );
  }, [prev1Expenses]);

  const prev2SpentPaise = useMemo(() => {
    return prev2Expenses.reduce(
      (sum: number, t: TransactionDto) => sum + Number(t.amountPaise),
      0
    );
  }, [prev2Expenses]);

  // Daily Average calculation
  const dailyAveragePaise = useMemo(() => {
    if (currentSpentPaise <= 0) return 0;
    const isCurrentMonth = selectedMonthYear === currentMonthStr;
    const days = isCurrentMonth
      ? Math.max(1, now.getDate())
      : new Date(yearNum, monthNum, 0).getDate();
    return Math.round(currentSpentPaise / days);
  }, [currentSpentPaise, selectedMonthYear, currentMonthStr, yearNum, monthNum]);

  // Month-over-Month Delta analysis (Current Month vs Previous Month)
  const momAnalysis = useMemo(() => {
    if (prev1SpentPaise === 0 && currentSpentPaise === 0) {
      return {
        status: 'NO_DATA',
        text: 'No expense activity recorded',
        isLower: true,
      };
    }
    if (prev1SpentPaise === 0 && currentSpentPaise > 0) {
      return {
        status: 'FIRST_MONTH',
        text: 'First month with recorded expenses',
        isLower: false,
      };
    }

    const diffPaise = currentSpentPaise - prev1SpentPaise;
    const percent = Math.round((Math.abs(diffPaise) / prev1SpentPaise) * 100);

    if (diffPaise < 0) {
      return {
        status: 'LOWER',
        text: `${formatINR(Math.abs(diffPaise), true)} (${percent}%) lower than ${prevMonth1Label}`,
        isLower: true,
      };
    } else if (diffPaise > 0) {
      return {
        status: 'HIGHER',
        text: `${formatINR(diffPaise, true)} (${percent}%) higher than ${prevMonth1Label}`,
        isLower: false,
      };
    } else {
      return {
        status: 'SAME',
        text: `Identical to ${prevMonth1Label} spending`,
        isLower: true,
      };
    }
  }, [currentSpentPaise, prev1SpentPaise, prevMonth1Label]);

  // 3-Month Bar Chart calculations
  const max3MonthPaise = Math.max(
    currentSpentPaise,
    prev1SpentPaise,
    prev2SpentPaise,
    1
  );

  const monthBars = [
    {
      monthStr: prevMonth2Str,
      label: prevMonth2Label,
      amountPaise: prev2SpentPaise,
      heightPercent: Math.max(
        12,
        Math.round((prev2SpentPaise / max3MonthPaise) * 100)
      ),
      isCurrent: false,
    },
    {
      monthStr: prevMonth1Str,
      label: prevMonth1Label,
      amountPaise: prev1SpentPaise,
      heightPercent: Math.max(
        12,
        Math.round((prev1SpentPaise / max3MonthPaise) * 100)
      ),
      isCurrent: false,
    },
    {
      monthStr: selectedMonthYear,
      label: currentMonthShortLabel,
      amountPaise: currentSpentPaise,
      heightPercent: Math.max(
        12,
        Math.round((currentSpentPaise / max3MonthPaise) * 100)
      ),
      isCurrent: true,
    },
  ];

  // Category breakdown calculation
  const { categoryStats, topCategory } = useMemo(() => {
    const catMap = new Map<
      string,
      { name: string; amountPaise: number; count: number }
    >();
    for (const t of currentExpenses) {
      const name = t.categoryName || 'General';
      const prev = catMap.get(name) || { name, amountPaise: 0, count: 0 };
      catMap.set(name, {
        name,
        amountPaise: prev.amountPaise + Number(t.amountPaise),
        count: prev.count + 1,
      });
    }

    const list = Array.from(catMap.values())
      .map((item) => ({
        ...item,
        percent:
          currentSpentPaise > 0
            ? Math.round((item.amountPaise / currentSpentPaise) * 100)
            : 0,
      }))
      .sort((a, b) => b.amountPaise - a.amountPaise);

    const highest =
      list.length > 0 && list[0].amountPaise > 0 ? list[0] : null;

    return {
      categoryStats: list,
      topCategory: highest,
    };
  }, [currentExpenses, currentSpentPaise]);

  if (loadingCurrent && currentExpenses.length === 0) {
    return (
      <View
        style={[
          styles.centerContainer,
          { backgroundColor: palette.surfaceBeige },
        ]}
      >
        <SkeletonLoader count={4} height={90} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.surfaceBeige }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Month Header with Navigator */}
      <View style={styles.monthHeaderRow}>
        <View>
          <Text style={[styles.screenLabel, { color: palette.textMocha }]}>
            Spending Insights
          </Text>
          <Text
            style={[styles.monthSelectorTitle, { color: palette.textEspresso }]}
          >
            {monthLabel}
          </Text>
        </View>

        <View style={styles.monthControls}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handlePrevMonth}
            style={[
              styles.monthArrowBtn,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.borderLatte,
              },
            ]}
          >
            <Ionicons
              name="chevron-back"
              size={16}
              color={palette.textEspresso}
            />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleNextMonth}
            style={[
              styles.monthArrowBtn,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.borderLatte,
              },
            ]}
          >
            <Ionicons
              name="chevron-forward"
              size={16}
              color={palette.textEspresso}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* 1. Monthly Spending Hero Card (Pure Spending & Daily Average) */}
      <View
        style={[
          styles.monthlySpendingCard,
          {
            backgroundColor: palette.surfaceElevated,
            borderColor: palette.borderLatte,
          },
        ]}
      >
        <View style={styles.monthlyCardHeaderRow}>
          <View style={styles.badgeMonthlySpend}>
            <Ionicons name="flame" size={13} color="#059669" />
            <Text style={styles.badgeMonthlySpendText}>MONTHLY OUTFLOW</Text>
          </View>
          <Text style={[styles.monthPillLabel, { color: palette.textMocha }]}>
            {monthLabel}
          </Text>
        </View>

        {/* Big Spending Amount */}
        <Text
          style={[styles.monthlyAmountText, { color: palette.textEspresso }]}
        >
          {formatINR(currentSpentPaise)}
        </Text>

        {/* Financial Vitals (Daily Average & Total Expense Count) */}
        <View
          style={[styles.vitalsRow, { borderTopColor: palette.borderLatte }]}
        >
          <View style={styles.vitalCol}>
            <View style={styles.vitalIconRow}>
              <Ionicons
                name="calendar-outline"
                size={14}
                color={palette.textMocha}
              />
              <Text style={[styles.vitalLabel, { color: palette.textMocha }]}>
                Daily Average
              </Text>
            </View>
            <Text
              style={[styles.vitalValue, { color: palette.textEspresso }]}
            >
              {formatINR(dailyAveragePaise, true)}
              <Text style={styles.vitalUnit}> / day</Text>
            </Text>
          </View>

          <View
            style={[
              styles.vitalDivider,
              { backgroundColor: palette.borderLatte },
            ]}
          />

          <View style={styles.vitalCol}>
            <View style={styles.vitalIconRow}>
              <Ionicons
                name="receipt-outline"
                size={14}
                color={palette.textMocha}
              />
              <Text style={[styles.vitalLabel, { color: palette.textMocha }]}>
                Expenses
              </Text>
            </View>
            <Text
              style={[styles.vitalValue, { color: palette.textEspresso }]}
            >
              {currentExpenses.length}{' '}
              <Text style={styles.vitalUnit}>transactions</Text>
            </Text>
          </View>
        </View>
      </View>

      {/* 2. 3-Month Spending Trend & Comparison */}
      <View
        style={[
          styles.trendCard,
          {
            backgroundColor: palette.surfaceElevated,
            borderColor: palette.borderLatte,
          },
        ]}
      >
        <View style={styles.trendHeaderRow}>
          <View>
            <Text
              style={[styles.trendTitle, { color: palette.textEspresso }]}
            >
              3-Month Spending Trend
            </Text>
            <Text style={[styles.trendSub, { color: palette.textMocha }]}>
              Month-over-month comparison
            </Text>
          </View>

          {/* MoM Badge */}
          <View
            style={[
              styles.momBadge,
              momAnalysis.isLower ? styles.momBadgeLower : styles.momBadgeHigher,
            ]}
          >
            <Ionicons
              name={momAnalysis.isLower ? 'trending-down' : 'trending-up'}
              size={13}
              color={momAnalysis.isLower ? '#059669' : '#DC2626'}
            />
            <Text
              style={[
                styles.momBadgeText,
                { color: momAnalysis.isLower ? '#059669' : '#DC2626' },
              ]}
              numberOfLines={1}
            >
              {momAnalysis.text}
            </Text>
          </View>
        </View>

        {/* 3-Month Vertical Comparison Bars */}
        <View style={styles.barsContainer}>
          {monthBars.map((bar) => {
            return (
              <TouchableOpacity
                key={bar.monthStr}
                activeOpacity={0.8}
                onPress={() => setSelectedMonthYear(bar.monthStr)}
                style={styles.barColumn}
              >
                <Text
                  style={[
                    styles.barAmountText,
                    bar.isCurrent && { color: '#059669', fontWeight: '800' },
                  ]}
                  numberOfLines={1}
                >
                  {formatINR(bar.amountPaise, true)}
                </Text>

                <View
                  style={[
                    styles.barTrack,
                    { backgroundColor: palette.surfaceBeige },
                  ]}
                >
                  <View
                    style={[
                      styles.barFill,
                      {
                        height: `${bar.heightPercent}%`,
                        backgroundColor: bar.isCurrent
                          ? '#059669'
                          : '#94A3B8',
                      },
                    ]}
                  />
                </View>

                <View style={styles.barLabelWrapper}>
                  <Text
                    style={[
                      styles.barMonthLabel,
                      bar.isCurrent && {
                        color: '#059669',
                        fontWeight: '800',
                      },
                    ]}
                  >
                    {bar.label}
                  </Text>
                  {bar.isCurrent && <View style={styles.activeDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.trendFooterNote, { color: palette.textMocha }]}>
          💡 Tap any month bar above to explore that month's detailed breakdown
        </Text>
      </View>

      {/* 3. Top Spending Category Highlight */}
      {topCategory && (
        <View
          style={[
            styles.topCategoryCallout,
            {
              backgroundColor: palette.surfaceElevated,
              borderColor: palette.borderLatte,
            },
          ]}
        >
          <View style={styles.topCategoryLeft}>
            <View
              style={[
                styles.categoryIconCircle,
                { backgroundColor: getCategoryTheme(topCategory.name).bg },
              ]}
            >
              <Ionicons
                name={getCategoryTheme(topCategory.name).icon}
                size={20}
                color={getCategoryTheme(topCategory.name).color}
              />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.topCategoryPillWrapper}>
                <Text style={styles.topCategoryPill}>HIGHEST SPENDING CATEGORY</Text>
              </View>
              <Text
                style={[
                  styles.topCategoryName,
                  { color: palette.textEspresso },
                ]}
                numberOfLines={1}
              >
                {topCategory.name}
              </Text>
            </View>
          </View>
          <View style={styles.topCategoryRight}>
            <Text
              style={[
                styles.topCategoryAmount,
                { color: palette.textEspresso },
              ]}
            >
              {formatINR(topCategory.amountPaise, true)}
            </Text>
            <Text style={styles.topCategoryPercent}>
              {topCategory.percent}% of total
            </Text>
          </View>
        </View>
      )}

      {/* 4. Category Breakdown List */}
      <View
        style={[
          styles.breakdownCard,
          {
            backgroundColor: palette.surfaceElevated,
            borderColor: palette.borderLatte,
          },
        ]}
      >
        <View style={styles.breakdownHeaderRow}>
          <Text
            style={[styles.breakdownHeading, { color: palette.textEspresso }]}
          >
            Where You Spent
          </Text>
          <Text
            style={[styles.breakdownCountLabel, { color: palette.textMocha }]}
          >
            {categoryStats.length} Categories
          </Text>
        </View>

        {categoryStats.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="wallet-outline"
              size={36}
              color={palette.textMocha}
              style={{ opacity: 0.5, marginBottom: 8 }}
            />
            <Text style={[styles.emptyNote, { color: palette.textMocha }]}>
              No expenses recorded for {monthLabel}.
            </Text>
          </View>
        ) : (
          categoryStats.map((c, i) => {
            const theme = getCategoryTheme(c.name);
            const isTop = i === 0;
            return (
              <View
                key={c.name}
                style={[
                  styles.categoryItemRow,
                  i !== categoryStats.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: palette.borderLatte,
                  },
                ]}
              >
                <View
                  style={[
                    styles.categoryIconSmall,
                    { backgroundColor: theme.bg },
                  ]}
                >
                  <Ionicons name={theme.icon} size={15} color={theme.color} />
                </View>

                <View style={styles.categoryInfoCol}>
                  <View style={styles.categoryNameRow}>
                    <Text
                      style={[
                        styles.categoryRowName,
                        { color: palette.textEspresso },
                        isTop && { fontWeight: '800' },
                      ]}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                    <Text
                      style={[
                        styles.categoryRowAmount,
                        { color: palette.textEspresso },
                      ]}
                    >
                      {formatINR(c.amountPaise, true)}
                    </Text>
                  </View>

                  {/* Horizontal Progress Bar */}
                  <View
                    style={[
                      styles.subBarTrack,
                      { backgroundColor: palette.surfaceBeige },
                    ]}
                  >
                    <View
                      style={[
                        styles.subBarFill,
                        {
                          width: `${Math.max(2, c.percent)}%`,
                          backgroundColor: isTop ? '#059669' : theme.color,
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.categoryMetaRow}>
                    <Text
                      style={[
                        styles.categoryCountText,
                        { color: palette.textMocha },
                      ]}
                    >
                      {c.count} transaction{c.count === 1 ? '' : 's'}
                    </Text>
                    <Text
                      style={[
                        styles.categoryRowPercent,
                        { color: palette.textMocha },
                        isTop && { color: '#059669', fontWeight: '800' },
                      ]}
                    >
                      {c.percent}%
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 100 : 80,
    gap: 14,
  },
  centerContainer: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  monthHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  screenLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  monthSelectorTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: SYSTEM_FONT_STACK,
    letterSpacing: -0.3,
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthlySpendingCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  monthlyCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeMonthlySpend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgeMonthlySpendText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  monthPillLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  monthlyAmountText: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  vitalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  vitalCol: {
    flex: 1,
    gap: 3,
  },
  vitalIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  vitalLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  vitalValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  vitalUnit: {
    fontSize: 11,
    fontWeight: '500',
  },
  vitalDivider: {
    width: 1,
    height: 30,
    marginHorizontal: 12,
  },
  trendCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },
  trendHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  trendTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  trendSub: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 2,
  },
  momBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: '52%',
  },
  momBadgeLower: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  momBadgeHigher: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  momBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 140,
    paddingTop: 16,
    paddingHorizontal: 10,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    gap: 6,
  },
  barAmountText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  barTrack: {
    width: 32,
    height: 84,
    borderRadius: 8,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 8,
  },
  barLabelWrapper: {
    alignItems: 'center',
    gap: 2,
  },
  barMonthLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#059669',
  },
  trendFooterNote: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
  },
  topCategoryCallout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
    gap: 12,
  },
  topCategoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  categoryIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCategoryPillWrapper: {
    alignSelf: 'flex-start',
  },
  topCategoryPill: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  topCategoryName: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  topCategoryRight: {
    alignItems: 'flex-end',
  },
  topCategoryAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  topCategoryPercent: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
    marginTop: 2,
  },
  breakdownCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  breakdownHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  breakdownHeading: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  breakdownCountLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyNote: {
    fontSize: 13,
    fontWeight: '500',
  },
  categoryItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  categoryIconSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryInfoCol: {
    flex: 1,
    gap: 5,
  },
  categoryNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryRowName: {
    fontSize: 13.5,
    fontWeight: '600',
    flex: 1,
  },
  categoryRowAmount: {
    fontSize: 13.5,
    fontWeight: '700',
    marginLeft: 8,
  },
  subBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  subBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  categoryMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryCountText: {
    fontSize: 10.5,
    fontWeight: '500',
  },
  categoryRowPercent: {
    fontSize: 10.5,
    fontWeight: '700',
  },
});
