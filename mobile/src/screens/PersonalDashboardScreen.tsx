import React, { useState, useMemo, useEffect } from 'react';
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
import * as Haptics from 'expo-haptics';
import { useFinTrackTheme } from '../context/ThemeContext';
import { SYSTEM_FONT_STACK, EMERALD_THEME } from '../theme/colors';
import {
  useDashboardSummary,
  useBudgets,
  useTransactions,
  useVaultDocuments,
  useCreateTransaction,
  useScanBillOcr,
  useSaveQrTransaction,
} from '../hooks/useFinTrackQueries';
import { TransactionDto, DocumentVaultDto, PaymentChannel } from '../types/ledger';
import { formatINR } from '../utils/paise';
import { SkeletonLoader, EmptyStateCard } from '../components/QueryStateViews';
import { TransactionDetailModal } from '../components/TransactionDetailModal';
import { ManualTransactionModal } from '../components/ManualTransactionModal';
import { BillScannerModal, ScannedBillResult } from '../components/BillScannerModal';

interface PersonalDashboardProps {
  onOpenContactDetail?: (contactId: string) => void;
  onNavigateToTab?: (
    tabName: 'HOME' | 'TRANSACTIONS' | 'VAULT' | 'INSIGHTS' | 'UDHAAR' | 'PROFILE'
  ) => void;
  onTriggerVoice?: () => void;
  isRecordingVoice?: boolean;
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
  onTriggerVoice,
  isRecordingVoice = false,
}) => {
  const { activeWorkspaceId } = useFinTrackTheme();

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

  // Queries & Mutations
  const summaryQuery = useDashboardSummary(activeWorkspaceId);
  const budgetsQuery = useBudgets(activeWorkspaceId, selectedMonthYear);
  const transactionsQuery = useTransactions(activeWorkspaceId, {
    monthYear: selectedMonthYear,
  });
  const vaultQuery = useVaultDocuments(activeWorkspaceId);
  const scanBillMutation = useScanBillOcr(activeWorkspaceId);
  const saveQrMutation = useSaveQrTransaction(activeWorkspaceId);
  const createTxMutation = useCreateTransaction(activeWorkspaceId);

  const [isExpiryBannerDismissed, setIsExpiryBannerDismissed] = useState(false);

  // Urgent Expiring Document Alert (Insurance / Warranty / RC due in <= 10 days)
  const urgentExpiringDoc = useMemo(() => {
    if (!vaultQuery.data?.documents || vaultQuery.data.documents.length === 0) {
      return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const candidates: Array<{
      doc: DocumentVaultDto;
      diffDays: number;
      isExpired: boolean;
      formattedExpiry: string;
    }> = [];

    for (const doc of vaultQuery.data.documents) {
      if (!doc.expiryDate) continue;
      const [y, m, d] = doc.expiryDate.split('-').map(Number);
      if (!y || !m || !d) continue;

      const expDate = new Date(y, m - 1, d, 0, 0, 0);
      const diffMs = expDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Show if expiring within 10 days or expired in last 7 days
      if (diffDays <= 10 && diffDays >= -7) {
        const formattedExpiry = expDate.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        });
        candidates.push({
          doc,
          diffDays,
          isExpired: diffDays < 0,
          formattedExpiry,
        });
      }
    }

    if (candidates.length === 0) return null;

    // Sort: upcoming renewals first (smallest positive diffDays), then expired
    candidates.sort((a, b) => {
      if (a.diffDays >= 0 && b.diffDays >= 0) return a.diffDays - b.diffDays;
      if (a.diffDays >= 0) return -1;
      if (b.diffDays >= 0) return 1;
      return b.diffDays - a.diffDays;
    });

    return candidates[0];
  }, [vaultQuery.data?.documents]);

  // Daily Midnight Reset: Automatically rollover at 12:00 AM local time
  const [currentDayKey, setCurrentDayKey] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  useEffect(() => {
    const checkMidnight = () => {
      const d = new Date();
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (key !== currentDayKey) {
        setCurrentDayKey(key);
      }
    };

    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1
    );
    const msUntilMidnight = Math.max(1000, nextMidnight.getTime() - now.getTime());

    const timeoutId = setTimeout(checkMidnight, msUntilMidnight);
    const intervalId = setInterval(checkMidnight, 30000);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [currentDayKey]);

  // Formatted date string for Today's Spending (e.g. "30 October 2026")
  const todayFormattedDate = useMemo(() => {
    const d = new Date();
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }, [currentDayKey]);

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

  // Today's Confirmed Expenses: SUM(amount_paise) where kind == 'EXPENSE' and occurredAt >= local midnight
  const { todayExpensePaise, todayExpenseCount } = useMemo(() => {
    const d = new Date();
    const localMidnightMs = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      0,
      0,
      0,
      0
    ).getTime();

    let sumPaise = 0;
    let count = 0;

    for (const t of allTransactions) {
      if (t.kind === 'EXPENSE') {
        const tTime = new Date(t.occurredAt).getTime();
        if (tTime >= localMidnightMs) {
          sumPaise += Number(t.amountPaise);
          count++;
        }
      }
    }

    return {
      todayExpensePaise: sumPaise,
      todayExpenseCount: count,
    };
  }, [allTransactions, currentDayKey]);

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

        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (_) {}

        setScanToast({
          type: 'SUCCESS',
          message: `✓ Recorded ${amtStr} to ${title}`,
        });

        setTimeout(() => {
          setScanToast(null);
        }, 3500);
      } else if (response.ocrSummary?.totalRupees && response.ocrSummary.totalRupees > 0) {
        // Direct auto-save fallback if backend OCR extracted amount
        const title = response.ocrSummary.merchantName || 'Receipt Expense';
        const amtRupees = response.ocrSummary.totalRupees;
        try {
          await createTxMutation.mutateAsync({
            kind: 'EXPENSE',
            amountRupees: amtRupees,
            merchantOrPayee: title,
            categoryName: response.ocrSummary.suggestedCategory || 'Grocery & Rashan',
            paymentVia: 'OTHER',
            sourceType: 'BILL',
            description: response.ocrSummary.summaryNote || `Scanned bill from ${title}`,
          });

          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (_) {}

          setScanToast({
            type: 'SUCCESS',
            message: `✓ Recorded ₹${Number(amtRupees).toLocaleString('en-IN')} to ${title}`,
          });
          setTimeout(() => setScanToast(null), 3500);
        } catch (saveErr) {
          console.warn('Auto-save fallback failed:', saveErr);
          setScanToast({
            type: 'ERROR',
            message: 'Could not auto-save bill.',
          });
          setTimeout(() => setScanToast(null), 3500);
        }
      } else {
        // Zero-Interruption: Never open manual confirmation modal on bill scan!
        setScanToast({
          type: 'ERROR',
          message: 'Could not detect amount from bill photo.',
        });
        setTimeout(() => {
          setScanToast(null);
        }, 3500);
      }
    } catch (scanErr: unknown) {
      console.warn('Background bill scan failed:', scanErr);
      setScanToast({
        type: 'ERROR',
        message: 'Could not process bill image.',
      });
      setTimeout(() => {
        setScanToast(null);
      }, 3500);
    }
  };

  // Instant Zero-Touch UPI QR Auto-Save (Zero Popups, Zero Edit Forms)
  const handleQrScannedSuccess = async (info: {
    amountRupees?: number;
    merchantOrPayee: string;
    note?: string;
  }) => {
    const rawAmt = info.amountRupees;
    const amtStr = rawAmt && rawAmt > 0
      ? `₹${Number(rawAmt).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : '';
    const merchant = info.merchantOrPayee || 'UPI Merchant';

    // Show immediate bottom toast
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
    <View style={styles.screenWrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Compact Search Bar */}
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

        {/* Action Row: Scan Bill & Manual Add (Top Side of Monthly Spending) */}
        <View style={styles.topActionsRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleScanBill}
            disabled={isScanningBill}
            style={styles.topScanBtn}
          >
            {isScanningBill ? (
              <ActivityIndicator size="small" color="#059669" />
            ) : (
              <>
                <Ionicons name="scan-outline" size={17} color="#059669" />
                <Text style={styles.topScanBtnText}>Scan Bill</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setIsManualModalOpen(true)}
            style={styles.topManualBtn}
          >
            <Ionicons name="add" size={19} color="#FFFFFF" />
            <Text style={styles.topManualBtnText}>Manual Add</Text>
          </TouchableOpacity>
        </View>

        {/* Smart Urgent Document Expiry Alert Widget */}
        {urgentExpiringDoc && !isExpiryBannerDismissed && (
          <View
            style={[
              styles.expiryBannerContainer,
              urgentExpiringDoc.isExpired
                ? styles.expiryBannerExpired
                : styles.expiryBannerUpcoming,
            ]}
          >
            <View style={styles.expiryBannerIconWrap}>
              <Ionicons
                name={urgentExpiringDoc.isExpired ? 'alert-circle' : 'time'}
                size={22}
                color={urgentExpiringDoc.isExpired ? '#DC2626' : '#D97706'}
              />
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.expiryBannerContent}
              onPress={() => onNavigateToTab && onNavigateToTab('VAULT')}
            >
              <View style={styles.expiryBannerHeaderRow}>
                <Text
                  style={[
                    styles.expiryBannerBadge,
                    urgentExpiringDoc.isExpired
                      ? styles.expiryBannerBadgeExpired
                      : styles.expiryBannerBadgeUpcoming,
                  ]}
                >
                  {urgentExpiringDoc.isExpired
                    ? 'EXPIRED'
                    : `RENEWAL IN ${urgentExpiringDoc.diffDays} DAY${urgentExpiringDoc.diffDays === 1 ? '' : 'S'}`}
                </Text>
                <Text style={styles.expiryBannerDate}>
                  Due: {urgentExpiringDoc.formattedExpiry}
                </Text>
              </View>

              <Text style={styles.expiryBannerTitle} numberOfLines={1}>
                {urgentExpiringDoc.doc.title}
              </Text>

              <View style={styles.expiryBannerActionRow}>
                <Text
                  style={[
                    styles.expiryBannerActionText,
                    urgentExpiringDoc.isExpired && { color: '#DC2626' },
                  ]}
                >
                  View Document in Vault
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={urgentExpiringDoc.isExpired ? '#DC2626' : '#059669'}
                />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setIsExpiryBannerDismissed(true)}
              style={styles.expiryBannerCloseBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={17} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        )}

        {/* Today's Spending Card (Rollover at 12:00 AM midnight) */}
        <View style={styles.todaySpendingCard}>
          {/* Header Row: Label & Formatted Date */}
          <View style={styles.todayCardHeader}>
            <View>
              <Text style={styles.todaySubLabel}>TODAY'S SPENDING</Text>
              <Text style={styles.todayDateTitle}>{todayFormattedDate}</Text>
            </View>

            <View style={styles.todayPillBadge}>
              <View style={styles.todayGreenDot} />
              <Text style={styles.todayPillBadgeText}>Today</Text>
            </View>
          </View>

          {/* Amount Row */}
          <View style={styles.todayAmountRow}>
            {transactionsQuery.isLoading && allTransactions.length === 0 ? (
              <ActivityIndicator
                size="small"
                color="#059669"
                style={{ alignSelf: 'flex-start', marginVertical: 8 }}
              />
            ) : (
              <Text style={styles.todayAmountText}>
                {formatINR(todayExpensePaise)}
              </Text>
            )}

            <Text style={styles.todayMetaSubtext}>
              {todayExpenseCount === 0
                ? 'No spends recorded yet today'
                : `${todayExpenseCount} spend${todayExpenseCount === 1 ? '' : 's'} recorded`}
            </Text>
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

        {/* Bill Scanner & UPI QR Modal */}
        <BillScannerModal
          visible={isScannerModalOpen}
          onClose={() => setIsScannerModalOpen(false)}
          onStartBackgroundScan={handleStartBackgroundScan}
          onQrScannedSuccess={handleQrScannedSuccess}
        />
      </ScrollView>

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
    paddingBottom: 90,
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
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  topScanBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  topScanBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
    fontFamily: SYSTEM_FONT_STACK,
  },
  topManualBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  topManualBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: SYSTEM_FONT_STACK,
  },
  todaySpendingCard: {
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
  todayCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  todaySubLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  todayDateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
    marginTop: 2,
  },
  todayPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  todayGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  todayPillBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
    fontFamily: SYSTEM_FONT_STACK,
  },
  todayAmountRow: {
    marginBottom: 4,
  },
  todayAmountText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
    fontVariant: ['tabular-nums'],
  },
  todayMetaSubtext: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    fontWeight: '500',
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
    fontSize: 14,
    fontWeight: '800',
    fontFamily: SYSTEM_FONT_STACK,
  },
  tapToEditHint: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 1,
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
  expiryBannerContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  expiryBannerUpcoming: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  expiryBannerExpired: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  expiryBannerIconWrap: {
    marginTop: 2,
    marginRight: 10,
  },
  expiryBannerContent: {
    flex: 1,
  },
  expiryBannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  expiryBannerBadge: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  expiryBannerBadgeUpcoming: {
    backgroundColor: '#FEF3C7',
    color: '#B45309',
  },
  expiryBannerBadgeExpired: {
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
  },
  expiryBannerDate: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  expiryBannerTitle: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  expiryBannerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expiryBannerActionText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
    marginRight: 2,
  },
  expiryBannerCloseBtn: {
    padding: 4,
    marginLeft: 6,
  },
});
