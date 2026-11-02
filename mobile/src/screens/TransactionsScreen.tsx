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
  useTransactions,
  useScanBillOcr,
  useSaveQrTransaction,
} from '../hooks/useFinTrackQueries';
import { TransactionDto, PaymentChannel } from '../types/ledger';
import { formatINR } from '../utils/paise';
import { SkeletonLoader, EmptyStateCard } from '../components/QueryStateViews';
import { TransactionDetailModal } from '../components/TransactionDetailModal';
import { ManualTransactionModal } from '../components/ManualTransactionModal';
import { BillScannerModal, ScannedBillResult } from '../components/BillScannerModal';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getCategoryIconName(categoryName: string, isIncome: boolean): keyof typeof Ionicons.glyphMap {
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

export const TransactionsScreen: React.FC = () => {
  const { activeWorkspaceId } = useFinTrackTheme();

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>(currentMonthStr);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
  const [selectedTx, setSelectedTx] = useState<TransactionDto | null>(null);

  // Manual Add & Scan Bill State
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [prefillValues, setPrefillValues] = useState<{
    amountRupees?: number;
    merchantOrPayee?: string;
    categoryName?: string;
    kind?: 'EXPENSE' | 'INCOME';
    paymentVia?: PaymentChannel;
    receiptImagePath?: string | null;
    receiptImageUrl?: string | null;
    description?: string;
  } | undefined>(undefined);
  const [isScanningBill, setIsScanningBill] = useState(false);
  const [scanToast, setScanToast] = useState<{
    type: 'PROCESSING' | 'SUCCESS' | 'ERROR';
    message: string;
  } | null>(null);

  const scanBillMutation = useScanBillOcr(activeWorkspaceId);
  const saveQrMutation = useSaveQrTransaction(activeWorkspaceId);

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
        (t: TransactionDto) =>
          t.categoryName.toLowerCase() === selectedCategoryFilter.toLowerCase()
      );
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const groupMap = new Map<
      string,
      { dateKey: string; dailySpentPaise: number; items: TransactionDto[] }
    >();

    for (const t of list) {
      const dateKey = new Date(t.occurredAt).toISOString().slice(0, 10);
      const prev = groupMap.get(dateKey) || {
        dateKey,
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
          dateKey: g.dateKey,
          displayHeader: header,
          dailySpentPaise: g.dailySpentPaise,
          items: g.items,
        };
      });
  }, [transactions, searchQuery, selectedCategoryFilter]);

  const handleScanBill = () => {
    setIsScannerModalOpen(true);
  };

  const handleStartBackgroundScan = async (
    compressedBase64: string,
    saveToVault?: boolean
  ) => {
    setScanToast({
      type: 'PROCESSING',
      message: 'Reading bill receipt...',
    });

    try {
      const response = await scanBillMutation.mutateAsync({
        imageBase64: compressedBase64,
        mimeType: 'image/jpeg',
        saveToVault: Boolean(saveToVault),
        vaultDocType: 'BILL',
      });

      if (response.autoSaved && response.savedSummary) {
        const saved = response.savedSummary;
        const amtStr = saved.amountFormatted || formatINR(saved.amountPaise);
        const title = saved.title || 'Receipt Expense';

        setScanToast({
          type: 'SUCCESS',
          message: `✓ Recorded ${amtStr} to ${title}`,
        });

        setTimeout(() => {
          setScanToast(null);
        }, 3500);
      } else {
        setScanToast({
          type: 'ERROR',
          message: 'Could not auto-detect amount. Please enter details.',
        });

        const ocr = response.ocrSummary;
        setPrefillValues({
          amountRupees: ocr?.totalRupees || undefined,
          merchantOrPayee: ocr?.merchantName || 'Scanned Receipt',
          categoryName: ocr?.suggestedCategory || 'Grocery & Rashan',
          kind: 'EXPENSE',
          paymentVia: 'UNSPECIFIED',
          receiptImagePath: response.savedSummary?.receiptImagePath || null,
          receiptImageUrl: response.savedSummary?.receiptImageUrl || null,
          description: ocr?.summaryNote || 'Scanned bill receipt',
        });
        setIsManualModalOpen(true);

        setTimeout(() => {
          setScanToast(null);
        }, 3000);
      }
    } catch (err: unknown) {
      console.warn('Background scan notice:', err);
      setScanToast({
        type: 'ERROR',
        message: 'Could not process bill automatically',
      });
      setTimeout(() => {
        setScanToast(null);
      }, 3000);
    }
  };

  // Instant Zero-Touch UPI QR Auto-Save
  const handleQrScannedSuccess = async (info: {
    amountRupees?: number;
    merchantOrPayee: string;
    note?: string;
  }) => {
    const rawAmt = info.amountRupees;
    const amtStr =
      rawAmt && rawAmt > 0
        ? `₹${Number(rawAmt).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
        : '';
    const merchant = info.merchantOrPayee || 'UPI Merchant';

    setScanToast({
      type: 'SUCCESS',
      message: amtStr
        ? `✓ Recorded ${amtStr} to ${merchant}`
        : `✓ Recorded UPI payment to ${merchant}`,
    });

    try {
      await saveQrMutation.mutateAsync({
        amountRupees: rawAmt || 0,
        merchantOrPayee: merchant,
        paymentMethod: 'UPI',
        source: 'QR_SCAN',
        note: info.note || `Paid to ${merchant} via UPI QR`,
      });
    } catch (err: unknown) {
      console.warn('QR auto-save notice:', err);
    }

    setTimeout(() => {
      setScanToast(null);
    }, 3500);
  };

  const handleBillScanned = (res: ScannedBillResult) => {
    setPrefillValues({
      amountRupees: res.amountRupees,
      merchantOrPayee: res.merchantOrPayee,
      categoryName: res.categoryName || 'Grocery & Rashan',
      kind: 'EXPENSE',
      paymentVia: res.paymentVia,
      receiptImagePath: res.receiptImagePath,
      receiptImageUrl: res.receiptImageUrl,
      description: res.summaryNote || '',
    });
    setIsManualModalOpen(true);
  };

  return (
    <View style={styles.container}>
      {/* Month Header */}
      <View style={styles.monthHeaderRow}>
        <View>
          <Text style={styles.screenLabel}>All Transactions</Text>
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

      {/* Top Action Buttons: [ 📷 Scan Bill ] & [ ＋ Manual Add ] */}
      <View style={styles.topActionsRow}>
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
              <Ionicons name="camera-outline" size={17} color="#059669" />
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
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.actionBtnTextWhite}>Manual Add</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBarBox}>
        <Ionicons name="search-outline" size={16} color="#94A3B8" />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by merchant, item or note..."
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle-outline" size={16} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Category Filter Pills (Fixed padding, line-height, and height to prevent text clipping) */}
      <View style={styles.filterPillsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPillsScroll}
        >
          {availableCategories.map((cat) => {
            const isSelected =
              selectedCategoryFilter.toLowerCase() === cat.toLowerCase();
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
                  {cat === 'ALL' ? 'All' : cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Transactions List */}
      <ScrollView
        contentContainerStyle={styles.scrollList}
        showsVerticalScrollIndicator={false}
      >
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
                      {/* Standard, reliable Ionicons vector icon badge */}
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
                        <View style={styles.txMetaRow}>
                          <Text style={styles.txMetaText}>
                            {item.categoryName} • {formattedTime}
                            {item.paymentVia && item.paymentVia !== 'UNSPECIFIED'
                              ? ` • ${item.paymentVia}`
                              : (item.receiptImagePath || item.receiptImageUrl) ? ' • Bill' : ''}
                          </Text>
                          {Boolean(item.receiptImagePath || item.receiptImageUrl) && (
                            <View style={styles.paperclipBadge}>
                              <Ionicons name="attach" size={12} color="#0284C7" />
                              <Text style={styles.paperclipText}>Bill</Text>
                            </View>
                          )}
                        </View>
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
                      <Text style={styles.tapToEditHint}>
                        Tap to edit / delete
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      {/* Transaction Detail, Edit & Delete Modal */}
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

      {/* Bill Scanner & UPI QR Modal */}
      <BillScannerModal
        visible={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        onStartBackgroundScan={handleStartBackgroundScan}
        onQrScannedSuccess={handleQrScannedSuccess}
      />

      {/* Sleek Floating Background Scan Toast */}
      {scanToast && (
        <View
          style={[
            styles.floatingScanToast,
            scanToast.type === 'PROCESSING' && styles.scanToastProcessing,
            scanToast.type === 'SUCCESS' && styles.scanToastSuccess,
            scanToast.type === 'ERROR' && styles.scanToastError,
          ]}
        >
          {scanToast.type === 'PROCESSING' && (
            <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
          )}
          <Text
            style={[
              styles.scanToastText,
              scanToast.type === 'SUCCESS' && styles.scanToastTextSuccess,
              scanToast.type === 'ERROR' && styles.scanToastTextError,
            ]}
          >
            {scanToast.message}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  monthHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  screenLabel: {
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
  topActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  actionBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
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
    height: 40,
    borderRadius: 12,
    backgroundColor: '#0F172A',
  },
  actionBtnTextWhite: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
  },
  filterPillsContainer: {
    marginBottom: 12,
  },
  filterPillsScroll: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 8,
    minHeight: 46,
    alignItems: 'center',
  },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
    lineHeight: 18,
    includeFontPadding: false,
  },
  scrollList: {
    paddingBottom: 100,
  },
  dateGroupContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateGroupHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
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
  },
  txMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  paperclipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    gap: 2,
  },
  paperclipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284C7',
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
  floatingScanToast: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: '#0F172A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  scanToastProcessing: {
    backgroundColor: '#0F172A',
  },
  scanToastSuccess: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  scanToastError: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  scanToastText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: SYSTEM_FONT_STACK,
  },
  scanToastTextSuccess: {
    color: '#065F46',
  },
  scanToastTextError: {
    color: '#991B1B',
  },
});
