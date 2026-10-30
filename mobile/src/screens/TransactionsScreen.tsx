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
import { useTransactions } from '../hooks/useFinTrackQueries';
import { TransactionDto } from '../types/ledger';
import { formatINR } from '../utils/paise';
import { SkeletonLoader, EmptyStateCard } from '../components/QueryStateViews';
import { TransactionDetailModal } from '../components/TransactionDetailModal';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const TransactionsScreen: React.FC = () => {
  const { activeWorkspaceId } = useFinTrackTheme();

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>(currentMonthStr);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
  const [selectedTx, setSelectedTx] = useState<TransactionDto | null>(null);

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

  const { data, isLoading } = useTransactions(activeWorkspaceId, {
    monthYear: selectedMonthYear,
  });

  const transactions = data?.transactions || [];

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t: TransactionDto) => {
      if (t.categoryName) set.add(t.categoryName);
    });
    return ['ALL', ...Array.from(set)];
  }, [transactions]);

  const dateGroups = useMemo(() => {
    let list = transactions;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (t: TransactionDto) =>
          t.merchantOrPayee.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.categoryName.toLowerCase().includes(q)
      );
    }

    if (selectedCategoryFilter !== 'ALL') {
      list = list.filter(
        (t: TransactionDto) => t.categoryName.toLowerCase() === selectedCategoryFilter.toLowerCase()
      );
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const groupMap = new Map<string, { dateKey: string; dailySpentPaise: number; items: TransactionDto[] }>();

    for (const t of list) {
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
  }, [transactions, searchQuery, selectedCategoryFilter]);

  return (
    <View style={styles.container}>
      {/* Month Header */}
      <View style={styles.monthHeaderRow}>
        <View>
          <Text style={styles.screenLabel}>All Transactions</Text>
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

      {/* Category Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterPillsScroll}
      >
        {availableCategories.map((cat) => {
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
              <Text style={[styles.filterPillText, isSelected && { color: '#FFFFFF', fontWeight: '700' }]}>
                {cat === 'ALL' ? 'All' : cat}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Transactions List */}
      <ScrollView contentContainerStyle={styles.scrollList} showsVerticalScrollIndicator={false}>
        {isLoading && transactions.length === 0 ? (
          <SkeletonLoader count={4} height={70} />
        ) : dateGroups.length === 0 ? (
          <EmptyStateCard
            title="No Transactions"
            message={
              searchQuery
                ? `No transactions matching "${searchQuery}".`
                : 'No transactions recorded for this month.'
            }
          />
        ) : (
          dateGroups.map((group) => (
            <View key={group.dateKey} style={styles.dateGroupContainer}>
              <View style={styles.dateGroupHeaderRow}>
                <Text style={styles.dateGroupTitle}>{group.displayHeader}</Text>
                <Text style={styles.dailySpentTotalText}>Spent: -{formatINR(group.dailySpentPaise)}</Text>
              </View>

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
                          { backgroundColor: isInc ? '#ECFDF5' : '#F1F5F9' },
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
                          { color: isInc ? '#059669' : '#0F172A' },
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
      </ScrollView>

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        visible={Boolean(selectedTx)}
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        workspaceId={activeWorkspaceId}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  monthHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  screenLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  monthSelectorTitle: {
    fontSize: 20,
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
  scrollList: {
    paddingBottom: 100,
  },
  dateGroupContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateGroupHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
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
