import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
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
  useUdhaarLedger,
  useCreateObligation,
  useDueReminders,
  useCreateTransaction,
  useScanBillOcr,
  useSaveQrTransaction,
} from '../hooks/useFinTrackQueries';
import {
  UdhaarLedgerItemDto,
  ObligationDirection,
  ContactKind,
  PaymentChannel,
} from '../types/ledger';
import { formatINR } from '../utils/paise';
import {
  SkeletonLoader,
  EmptyStateCard,
  ErrorRetryCard,
} from '../components/QueryStateViews';
import {
  PoliteReminderModal,
  ReminderTargetInfo,
} from '../components/PoliteReminderModal';
import { ManualTransactionModal } from '../components/ManualTransactionModal';
import { BillScannerModal, ScannedBillResult } from '../components/BillScannerModal';

type LedgerSubFilter = 'ALL' | 'OVERDUE' | 'DUE_TODAY';

interface BusinessDashboardProps {
  onOpenContactDetail: (contactId: string) => void;
  onTriggerVoice?: () => void;
  isRecordingVoice?: boolean;
}

export const BusinessDashboardScreen: React.FC<BusinessDashboardProps> = ({
  onOpenContactDetail,
}) => {
  const { palette, activeWorkspaceId } = useFinTrackTheme();

  const ledgerQuery = useUdhaarLedger(activeWorkspaceId);
  const dueRemindersQuery = useDueReminders(activeWorkspaceId);
  const createObligationMutation = useCreateObligation(activeWorkspaceId);
  const scanBillMutation = useScanBillOcr(activeWorkspaceId);
  const saveQrMutation = useSaveQrTransaction(activeWorkspaceId);
  const createTxMutation = useCreateTransaction(activeWorkspaceId);

  // Search & Active Ledger Type (Strictly Separates Receivables vs Payables)
  const [searchQuery, setSearchQuery] = useState('');
  const [activeLedgerType, setActiveLedgerType] =
    useState<'RECEIVABLE' | 'PAYABLE'>('RECEIVABLE');
  const [activeSubFilter, setActiveSubFilter] =
    useState<LedgerSubFilter>('ALL');

  // Scanner & Manual Add State
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [isScanningBill, setIsScanningBill] = useState(false);
  const [scanToast, setScanToast] = useState<{
    type: 'PROCESSING' | 'SUCCESS' | 'ERROR';
    message: string;
  } | null>(null);
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

  // New Credit Account Modal State
  const [showNewUdhaarModal, setShowNewUdhaarModal] = useState(false);
  const [reminderTarget, setReminderTarget] =
    useState<ReminderTargetInfo | null>(null);
  const [contactName, setContactName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [direction, setDirection] = useState<ObligationDirection>('RECEIVABLE');
  const [principalRupees, setPrincipalRupees] = useState('');
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [note, setNote] = useState('');

  const allContacts = ledgerQuery.data?.items || [];
  const summary = ledgerQuery.data?.summary;

  // Separate Receivables (Customers) and Payables (Suppliers)
  const rawReceivables = useMemo(
    () => allContacts.filter((c) => c.direction === 'RECEIVABLE'),
    [allContacts]
  );

  const rawPayables = useMemo(
    () => allContacts.filter((c) => c.direction === 'PAYABLE'),
    [allContacts]
  );

  // Filtered Receivables
  const filteredReceivables = useMemo(() => {
    let list = rawReceivables;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.phoneNumber.toLowerCase().includes(q)
      );
    }
    if (activeSubFilter === 'OVERDUE') {
      list = list.filter((c) => c.dueTag === 'OVERDUE');
    } else if (activeSubFilter === 'DUE_TODAY') {
      list = list.filter((c) => c.dueTag === 'DUE_TODAY');
    }
    return list;
  }, [rawReceivables, searchQuery, activeSubFilter]);

  // Filtered Payables
  const filteredPayables = useMemo(() => {
    let list = rawPayables;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.phoneNumber.toLowerCase().includes(q)
      );
    }
    if (activeSubFilter === 'OVERDUE') {
      list = list.filter((c) => c.dueTag === 'OVERDUE');
    } else if (activeSubFilter === 'DUE_TODAY') {
      list = list.filter((c) => c.dueTag === 'DUE_TODAY');
    }
    return list;
  }, [rawPayables, searchQuery, activeSubFilter]);

  const overdueReceivablesCount = useMemo(
    () => rawReceivables.filter((c) => c.dueTag === 'OVERDUE').length,
    [rawReceivables]
  );

  const overduePayablesCount = useMemo(
    () => rawPayables.filter((c) => c.dueTag === 'OVERDUE').length,
    [rawPayables]
  );

  const handleOpenRemind = (contact: UdhaarLedgerItemDto) => {
    setReminderTarget({
      obligationId: contact.obligationId,
      contactId: contact.contactId,
      contactName: contact.displayName,
      phoneNumber: contact.phoneNumber,
      remainingPaise: contact.remainingPaise,
      dueDate: contact.dueDate,
    });
  };

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
        const title = response.ocrSummary.merchantName || 'Supplier Expense';
        const amtRupees = response.ocrSummary.totalRupees;
        try {
          await createTxMutation.mutateAsync({
            kind: 'EXPENSE',
            amountRupees: amtRupees,
            merchantOrPayee: title,
            categoryName: response.ocrSummary.suggestedCategory || 'Dukaan Stock / Maal',
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
          console.warn('Auto-save fallback notice:', saveErr);
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

  // Instant Zero-Touch UPI QR Auto-Save for Business
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
    const merchant = info.merchantOrPayee || 'Supplier / Merchant';

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
      categoryName: res.categoryName || 'Dukaan Stock / Maal',
      kind: 'EXPENSE',
      paymentVia: res.paymentVia,
      receiptImagePath: res.receiptImagePath,
      receiptImageUrl: res.receiptImageUrl,
      description: res.summaryNote || '',
    });
    setIsManualModalOpen(true);
  };

  const handleOpenAddAccount = (dir: ObligationDirection) => {
    setDirection(dir);
    setContactName('');
    setPhoneNumber('');
    setPrincipalRupees('');
    setNote('');
    setShowNewUdhaarModal(true);
  };

  const handleCreateUdhaar = async () => {
    if (!contactName.trim() || !principalRupees.trim()) return;
    const kind: ContactKind =
      direction === 'RECEIVABLE' ? 'CUSTOMER' : 'SUPPLIER';
    await createObligationMutation.mutateAsync({
      displayName: contactName.trim(),
      phoneNumber: phoneNumber.trim(),
      kind,
      direction,
      principalRupees: principalRupees.trim(),
      dueDate: dueDate.trim(),
      titleOrNote: note.trim(),
    });
    setContactName('');
    setPhoneNumber('');
    setPrincipalRupees('');
    setNote('');
    setShowNewUdhaarModal(false);
  };

  if (ledgerQuery.isLoading) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SkeletonLoader count={4} height={80} />
      </ScrollView>
    );
  }

  if (ledgerQuery.isError) {
    const errMsg =
      ledgerQuery.error instanceof Error
        ? ledgerQuery.error.message
        : 'Unable to load business ledger.';
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ErrorRetryCard
          errorMessage={errMsg}
          onRetry={() => ledgerQuery.refetch()}
        />
      </ScrollView>
    );
  }

  return (
    <View style={styles.screenWrapper}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Search Bar */}
        <View style={styles.searchBarBox}>
          <Ionicons name="search-outline" size={17} color="#94A3B8" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search customers, suppliers, phone..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle-outline" size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* 2. Top Action Buttons: Scan Bill & Manual Add */}
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
                <Ionicons name="camera-outline" size={17} color="#059669" />
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

        {/* 3. Separated Receivable & Payable Summary Cards */}
        <View style={styles.summaryCardsRow}>
          {/* Card 1: Receivables (You Will Get) */}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => {
              setActiveLedgerType('RECEIVABLE');
              setActiveSubFilter('ALL');
            }}
            style={[
              styles.summaryCardHalf,
              styles.receivableCard,
              activeLedgerType === 'RECEIVABLE' && styles.cardActiveGreen,
            ]}
          >
            <View style={styles.cardHeaderSmall}>
              <View style={styles.pillGreenBadge}>
                <Ionicons name="arrow-down" size={11} color="#065F46" />
                <Text style={styles.pillGreenText}>YOU WILL GET</Text>
              </View>
              {overdueReceivablesCount > 0 && (
                <View style={styles.miniAlertDot} />
              )}
            </View>

            <Text style={styles.receivableAmountText}>
              +{formatINR(summary?.totalWillGetPaise || 0, true)}
            </Text>

            <Text style={styles.cardSubText}>
              {rawReceivables.length} Customer account(s)
            </Text>
          </TouchableOpacity>

          {/* Card 2: Payables (You Owe) */}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => {
              setActiveLedgerType('PAYABLE');
              setActiveSubFilter('ALL');
            }}
            style={[
              styles.summaryCardHalf,
              styles.payableCard,
              activeLedgerType === 'PAYABLE' && styles.cardActiveRed,
            ]}
          >
            <View style={styles.cardHeaderSmall}>
              <View style={styles.pillRedBadge}>
                <Ionicons name="arrow-up" size={11} color="#991B1B" />
                <Text style={styles.pillRedText}>YOU OWE</Text>
              </View>
              {overduePayablesCount > 0 && (
                <View style={styles.miniAlertDot} />
              )}
            </View>

            <Text style={styles.payableAmountText}>
              -{formatINR(summary?.totalWillGivePaise || 0, true)}
            </Text>

            <Text style={styles.cardSubText}>
              {rawPayables.length} Supplier account(s)
            </Text>
          </TouchableOpacity>
        </View>

        {/* 4. Prominent Two-Tab Segmented Switcher */}
        <View style={styles.segmentedTabContainer}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              setActiveLedgerType('RECEIVABLE');
              setActiveSubFilter('ALL');
            }}
            style={[
              styles.segmentedTabBtn,
              activeLedgerType === 'RECEIVABLE' && styles.tabBtnActiveGreen,
            ]}
          >
            <Ionicons
              name="people-outline"
              size={16}
              color={activeLedgerType === 'RECEIVABLE' ? '#FFFFFF' : '#64748B'}
            />
            <Text
              style={[
                styles.segmentedTabText,
                activeLedgerType === 'RECEIVABLE' && styles.tabTextActive,
              ]}
            >
              Receivables ({rawReceivables.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              setActiveLedgerType('PAYABLE');
              setActiveSubFilter('ALL');
            }}
            style={[
              styles.segmentedTabBtn,
              activeLedgerType === 'PAYABLE' && styles.tabBtnActiveRed,
            ]}
          >
            <Ionicons
              name="briefcase-outline"
              size={16}
              color={activeLedgerType === 'PAYABLE' ? '#FFFFFF' : '#64748B'}
            />
            <Text
              style={[
                styles.segmentedTabText,
                activeLedgerType === 'PAYABLE' && styles.tabTextActive,
              ]}
            >
              Payables ({rawPayables.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* 5. Sub-Filter Chips for Active Ledger */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subFiltersRow}
        >
          <TouchableOpacity
            onPress={() => setActiveSubFilter('ALL')}
            style={[
              styles.filterChip,
              activeSubFilter === 'ALL' && styles.filterChipActive,
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                activeSubFilter === 'ALL' && styles.filterChipTextActive,
              ]}
            >
              {activeLedgerType === 'RECEIVABLE'
                ? `All Customers (${rawReceivables.length})`
                : `All Suppliers (${rawPayables.length})`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveSubFilter('OVERDUE')}
            style={[
              styles.filterChip,
              activeSubFilter === 'OVERDUE' && styles.filterChipActiveRed,
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                activeSubFilter === 'OVERDUE' && styles.filterChipTextActiveRed,
              ]}
            >
              Overdue (
              {activeLedgerType === 'RECEIVABLE'
                ? overdueReceivablesCount
                : overduePayablesCount}
              )
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveSubFilter('DUE_TODAY')}
            style={[
              styles.filterChip,
              activeSubFilter === 'DUE_TODAY' && styles.filterChipActive,
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                activeSubFilter === 'DUE_TODAY' && styles.filterChipTextActive,
              ]}
            >
              Due Today
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* 6. Dedicated Accounts List Card */}
        <View style={styles.passbookCard}>
          <View style={styles.passbookHeaderRow}>
            <View>
              <Text style={styles.sectionHeader}>
                {activeLedgerType === 'RECEIVABLE'
                  ? 'CUSTOMER RECEIVABLES'
                  : 'SUPPLIER PAYABLES'}
              </Text>
              <Text style={styles.sectionSubtitle}>
                {activeLedgerType === 'RECEIVABLE'
                  ? 'People who owe money to this business'
                  : 'Vendors & suppliers this business owes money to'}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => handleOpenAddAccount(activeLedgerType)}
              style={styles.addAccountHeaderBtn}
            >
              <Ionicons name="add" size={15} color="#FFFFFF" />
              <Text style={styles.addAccountHeaderBtnText}>
                {activeLedgerType === 'RECEIVABLE' ? 'Customer' : 'Supplier'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* List items */}
          {activeLedgerType === 'RECEIVABLE' ? (
            filteredReceivables.length === 0 ? (
              <View style={{ padding: 16 }}>
                <EmptyStateCard
                  title="No Receivable Accounts"
                  message={
                    searchQuery
                      ? 'No customer matched your search.'
                      : 'You do not have any pending customer receivables.'
                  }
                  actionLabel="+ Add Customer"
                  onActionPress={() => handleOpenAddAccount('RECEIVABLE')}
                />
              </View>
            ) : (
              filteredReceivables.map((contact) => {
                const isOverdue = contact.dueTag === 'OVERDUE';
                return (
                  <TouchableOpacity
                    key={contact.obligationId}
                    activeOpacity={0.85}
                    onPress={() => onOpenContactDetail(contact.contactId)}
                    style={styles.accountRow}
                  >
                    <View style={styles.accountRowLeft}>
                      <Text style={styles.contactNameText} numberOfLines={1}>
                        {contact.displayName}
                      </Text>
                      <Text
                        style={[
                          styles.contactMetaText,
                          isOverdue && { color: '#DC2626', fontWeight: '600' },
                        ]}
                        numberOfLines={1}
                      >
                        Due {contact.dueDate}
                        {isOverdue ? ' • OVERDUE' : ''} • Paid{' '}
                        {formatINR(contact.repaidPaise)} of{' '}
                        {formatINR(contact.principalPaise)}
                      </Text>
                    </View>

                    <View style={styles.accountRowRight}>
                      <Text style={styles.receivableRowAmount}>
                        +{formatINR(contact.remainingPaise, true)}
                      </Text>

                      {contact.remainingPaise > 0 && (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => handleOpenRemind(contact)}
                          style={styles.notifyBtn}
                        >
                          <Ionicons
                            name="paper-plane-outline"
                            size={12}
                            color="#059669"
                          />
                          <Text style={styles.notifyBtnText}>Notify</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )
          ) : filteredPayables.length === 0 ? (
            <View style={{ padding: 16 }}>
              <EmptyStateCard
                title="No Payable Accounts"
                message={
                  searchQuery
                    ? 'No supplier matched your search.'
                    : 'You do not have any pending payments owed to suppliers.'
                }
                actionLabel="+ Add Supplier"
                onActionPress={() => handleOpenAddAccount('PAYABLE')}
              />
            </View>
          ) : (
            filteredPayables.map((contact) => {
              const isOverdue = contact.dueTag === 'OVERDUE';
              return (
                <TouchableOpacity
                  key={contact.obligationId}
                  activeOpacity={0.85}
                  onPress={() => onOpenContactDetail(contact.contactId)}
                  style={styles.accountRow}
                >
                  <View style={styles.accountRowLeft}>
                    <Text style={styles.contactNameText} numberOfLines={1}>
                      {contact.displayName}
                    </Text>
                    <Text
                      style={[
                        styles.contactMetaText,
                        isOverdue && { color: '#DC2626', fontWeight: '600' },
                      ]}
                      numberOfLines={1}
                    >
                      Due {contact.dueDate}
                      {isOverdue ? ' • OVERDUE' : ''} • Paid{' '}
                      {formatINR(contact.repaidPaise)} of{' '}
                      {formatINR(contact.principalPaise)}
                    </Text>
                  </View>

                  <View style={styles.accountRowRight}>
                    <Text style={styles.payableRowAmount}>
                      -{formatINR(contact.remainingPaise, true)}
                    </Text>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => onOpenContactDetail(contact.contactId)}
                      style={styles.payBtn}
                    >
                      <Text style={styles.payBtnText}>Pay / Details</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Modal: New Credit / Receivable Account */}
        <Modal visible={showNewUdhaarModal} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {direction === 'RECEIVABLE'
                  ? 'New Customer Receivable'
                  : 'New Supplier Payable'}
              </Text>

              <View style={styles.dirRow}>
                <TouchableOpacity
                  onPress={() => setDirection('RECEIVABLE')}
                  style={[
                    styles.dirBtn,
                    direction === 'RECEIVABLE' && {
                      backgroundColor: '#065F46',
                      borderColor: '#065F46',
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: SYSTEM_FONT_STACK,
                      fontSize: 12,
                      fontWeight: '700',
                      color:
                        direction === 'RECEIVABLE' ? '#FFFFFF' : '#0F172A',
                    }}
                  >
                    Receivable (Customer)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setDirection('PAYABLE')}
                  style={[
                    styles.dirBtn,
                    direction === 'PAYABLE' && {
                      backgroundColor: '#991B1B',
                      borderColor: '#991B1B',
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: SYSTEM_FONT_STACK,
                      fontSize: 12,
                      fontWeight: '700',
                      color: direction === 'PAYABLE' ? '#FFFFFF' : '#0F172A',
                    }}
                  >
                    Payable (Supplier)
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>
                {direction === 'RECEIVABLE' ? 'Customer Name' : 'Supplier Name'}
              </Text>
              <TextInput
                value={contactName}
                onChangeText={setContactName}
                placeholder={
                  direction === 'RECEIVABLE'
                    ? 'e.g. Rahul Verma'
                    : 'e.g. Shivam Wholesalers'
                }
                placeholderTextColor="#94A3B8"
                style={styles.input}
              />

              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                placeholder="+91 98765 43210"
                placeholderTextColor="#94A3B8"
                style={styles.input}
              />

              <Text style={styles.inputLabel}>Principal Amount (INR)</Text>
              <TextInput
                value={principalRupees}
                onChangeText={setPrincipalRupees}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#94A3B8"
                style={styles.input}
              />

              <Text style={styles.inputLabel}>Due Date (YYYY-MM-DD)</Text>
              <TextInput
                value={dueDate}
                onChangeText={setDueDate}
                placeholder="2026-11-15"
                placeholderTextColor="#94A3B8"
                style={styles.input}
              />

              <Text style={styles.inputLabel}>Reference / Note</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Invoice number or item description"
                placeholderTextColor="#94A3B8"
                style={styles.input}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => setShowNewUdhaarModal(false)}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCreateUdhaar}
                  disabled={createObligationMutation.isPending}
                  style={[
                    styles.saveBtn,
                    {
                      backgroundColor:
                        direction === 'RECEIVABLE' ? '#059669' : '#0F172A',
                    },
                  ]}
                >
                  <Text style={styles.saveBtnText}>
                    {createObligationMutation.isPending
                      ? 'Saving...'
                      : 'Save Account'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal: Manual Transaction / Bill Scan Prefill */}
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

        {/* Modal: Polite Reminder Target */}
        <PoliteReminderModal
          visible={reminderTarget !== null}
          target={reminderTarget}
          onClose={() => setReminderTarget(null)}
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
  scrollContent: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 90,
    gap: 12,
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
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
    fontFamily: SYSTEM_FONT_STACK,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  summaryCardsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCardHalf: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
  },
  receivableCard: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  payableCard: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  cardActiveGreen: {
    borderWidth: 2,
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  cardActiveRed: {
    borderWidth: 2,
    borderColor: '#DC2626',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  cardHeaderSmall: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  pillGreenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pillGreenText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
    fontFamily: SYSTEM_FONT_STACK,
    letterSpacing: 0.5,
  },
  pillRedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pillRedText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#991B1B',
    fontFamily: SYSTEM_FONT_STACK,
    letterSpacing: 0.5,
  },
  miniAlertDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#DC2626',
  },
  receivableAmountText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#065F46',
    fontFamily: SYSTEM_FONT_STACK,
    fontVariant: ['tabular-nums'],
    marginVertical: 2,
  },
  payableAmountText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#991B1B',
    fontFamily: SYSTEM_FONT_STACK,
    fontVariant: ['tabular-nums'],
    marginVertical: 2,
  },
  cardSubText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  segmentedTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
  },
  segmentedTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  tabBtnActiveGreen: {
    backgroundColor: '#059669',
  },
  tabBtnActiveRed: {
    backgroundColor: '#DC2626',
  },
  segmentedTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    fontFamily: SYSTEM_FONT_STACK,
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  subFiltersRow: {
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterChipActiveRed: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    fontFamily: SYSTEM_FONT_STACK,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterChipTextActiveRed: {
    color: '#FFFFFF',
  },
  passbookCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  passbookHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  sectionHeader: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  addAccountHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addAccountHeaderBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: SYSTEM_FONT_STACK,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  accountRowLeft: {
    flex: 1,
    paddingRight: 10,
  },
  contactNameText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  contactMetaText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 11,
    fontWeight: '400',
    color: '#64748B',
    marginTop: 2,
  },
  accountRowRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  receivableRowAmount: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 15,
    fontWeight: '800',
    color: '#065F46',
    fontVariant: ['tabular-nums'],
  },
  payableRowAmount: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 15,
    fontWeight: '800',
    color: '#DC2626',
    fontVariant: ['tabular-nums'],
  },
  notifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  notifyBtnText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  payBtn: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  payBtnText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalTitle: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
  },
  dirRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  dirBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  inputLabel: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    fontFamily: SYSTEM_FONT_STACK,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
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
