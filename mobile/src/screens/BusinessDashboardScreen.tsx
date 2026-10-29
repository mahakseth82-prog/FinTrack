import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  Linking,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import {
  useUdhaarLedger,
  useCreateObligation,
  useDueReminders,
} from '../hooks/useFinTrackQueries';
import {
  UdhaarLedgerItemDto,
  ObligationDirection,
  ContactKind,
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

type FilterChip = 'ALL' | 'OVERDUE' | 'DUE_TODAY' | 'CUSTOMERS' | 'SUPPLIERS';

interface BusinessDashboardProps {
  onOpenContactDetail: (contactId: string) => void;
}

export const BusinessDashboardScreen: React.FC<BusinessDashboardProps> = ({
  onOpenContactDetail,
}) => {
  const { palette, activeWorkspaceId } = useFinTrackTheme();

  // Live TanStack React Query Hooks (Zero hardcoded dummy data)
  const ledgerQuery = useUdhaarLedger(activeWorkspaceId);
  const dueRemindersQuery = useDueReminders(activeWorkspaceId);
  const createObligationMutation = useCreateObligation(activeWorkspaceId);

  const [activeFilter, setActiveFilter] = useState<FilterChip>('ALL');
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

  // 1. Loading State -> Animated Skeleton Loader
  if (ledgerQuery.isLoading) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SkeletonLoader count={4} height={115} />
      </ScrollView>
    );
  }

  // 2. Error State -> Clean Retry Card
  if (ledgerQuery.isError) {
    const errMsg =
      ledgerQuery.error instanceof Error
        ? ledgerQuery.error.message
        : 'Unable to fetch Udhaar Khata from backend.';
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ErrorRetryCard
          errorMessage={errMsg}
          onRetry={() => ledgerQuery.refetch()}
        />
      </ScrollView>
    );
  }

  const summary = ledgerQuery.data?.summary;
  const businessContacts = ledgerQuery.data?.items || [];

  const filteredContacts = businessContacts.filter((c) => {
    if (activeFilter === 'OVERDUE') return c.dueTag === 'OVERDUE';
    if (activeFilter === 'DUE_TODAY') return c.dueTag === 'DUE_TODAY';
    if (activeFilter === 'CUSTOMERS') return c.kind === 'CUSTOMER';
    if (activeFilter === 'SUPPLIERS') return c.kind === 'SUPPLIER';
    return true;
  });

  const handleDirectWhatsAppRemind = (contact: UdhaarLedgerItemDto) => {
    setReminderTarget({
      obligationId: contact.obligationId,
      contactId: contact.contactId,
      contactName: contact.displayName,
      phoneNumber: contact.phoneNumber,
      remainingPaise: contact.remainingPaise,
      dueDate: contact.dueDate,
    });
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

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Business Header Banner (Deep Mahogany #3E2723) */}
      <View
        style={[
          styles.mahoganyBanner,
          { backgroundColor: palette.primaryBrown },
        ]}
      >
        <View style={styles.bannerTopRow}>
          <View>
            <Text style={[styles.bannerTag, { color: palette.accentWarm }]}>
              🏪 DIGITAL UDHAAR LEDGER • VYAPAAR KHATA
            </Text>
            <Text style={[styles.bannerTitle, { color: palette.textOnPrimary }]}>
              Customer & Supplier Hisaab
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowNewUdhaarModal(true)}
            style={[
              styles.addCustomerBtn,
              { backgroundColor: palette.accentWarm },
            ]}
          >
            <Text
              style={[styles.addCustomerBtnText, { color: palette.textOnPrimary }]}
            >
              + Naya Udhaar
            </Text>
          </TouchableOpacity>
        </View>

        {/* Top Summary Cards: You Will Get vs You Will Give (From Backend) */}
        <View style={styles.summaryCardsRow}>
          <View
            style={[
              styles.summaryBox,
              {
                backgroundColor: palette.receiveSageTint,
                borderColor: palette.receiveSageGreen,
              },
            ]}
          >
            <Text
              style={[
                styles.summaryBoxLabel,
                { color: palette.receiveSageGreen },
              ]}
            >
              🟢 You Will Get (Lena Hai)
            </Text>
            <Text
              style={[
                styles.summaryBoxAmount,
                { color: palette.receiveSageGreen },
              ]}
            >
              {formatINR(summary?.totalWillGetPaise || 0)}
            </Text>
            <Text style={[styles.summaryBoxSub, { color: palette.textMocha }]}>
              Market / Customers Baki
            </Text>
          </View>

          <View
            style={[
              styles.summaryBox,
              {
                backgroundColor: palette.giveTerracottaTint,
                borderColor: palette.giveTerracottaRed,
              },
            ]}
          >
            <Text
              style={[
                styles.summaryBoxLabel,
                { color: palette.giveTerracottaRed },
              ]}
            >
              🔴 You Will Give (Dena Hai)
            </Text>
            <Text
              style={[
                styles.summaryBoxAmount,
                { color: palette.giveTerracottaRed },
              ]}
            >
              {formatINR(summary?.totalWillGivePaise || 0)}
            </Text>
            <Text style={[styles.summaryBoxSub, { color: palette.textMocha }]}>
              Suppliers / Wholesalers Baki
            </Text>
          </View>
        </View>
      </View>

      {/* 1B. 24-Hour Due Alert Banner (From /api/v1/reminders/due-soon) */}
      {(dueRemindersQuery.data?.dueSoonCount || 0) > 0 && (
        <View
          style={[
            styles.dueAlertBanner,
            {
              backgroundColor: palette.warningAmberTint,
              borderColor: palette.accentWarm,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.dueAlertTitle, { color: palette.textEspresso }]}
            >
              ⏰ {dueRemindersQuery.data?.dueSoonCount} Udhaar Due Within 24 Hours / Overdue
            </Text>
            <Text style={[styles.dueAlertSub, { color: palette.textMocha }]}>
              Tap [ 💬 Remind ] below to send a polite Hindi/Hinglish/English WhatsApp message.
            </Text>
          </View>
        </View>
      )}

      {/* 2. Quick Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {(
          [
            { id: 'ALL', label: 'All Khata' },
            { id: 'OVERDUE', label: '🚨 Overdue' },
            { id: 'DUE_TODAY', label: '⏰ Due Today' },
            { id: 'CUSTOMERS', label: '👥 Customers' },
            { id: 'SUPPLIERS', label: '🚛 Suppliers' },
          ] as { id: FilterChip; label: string }[]
        ).map((chip) => {
          const isSelected = activeFilter === chip.id;
          return (
            <TouchableOpacity
              key={chip.id}
              onPress={() => setActiveFilter(chip.id)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isSelected
                    ? palette.primaryBrown
                    : palette.surfaceBeige,
                  borderColor: isSelected
                    ? palette.primaryBrown
                    : palette.borderLatte,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: isSelected
                    ? palette.textOnPrimary
                    : palette.textEspresso,
                }}
              >
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 3. Customer & Supplier Ledger List (With Empty State) */}
      <View style={styles.listContainer}>
        {filteredContacts.length === 0 ? (
          <EmptyStateCard
            emoji="📒"
            title="No Udhaar Records Yet"
            message="No udhaar records match this filter. Tap below or use the mic to record your first customer or supplier entry!"
            actionLabel="+ Record First Udhaar"
            onActionPress={() => setShowNewUdhaarModal(true)}
          />
        ) : (
          filteredContacts.map((contact) => {
            const isReceivable = contact.direction === 'RECEIVABLE';
            const badgeColor =
              contact.dueTag === 'OVERDUE'
                ? palette.giveTerracottaRed
                : contact.dueTag === 'DUE_TODAY'
                  ? palette.warningAmber
                  : palette.primaryBrown;

            return (
              <TouchableOpacity
                key={contact.obligationId}
                activeOpacity={0.9}
                onPress={() => onOpenContactDetail(contact.contactId)}
                style={[
                  styles.customerCard,
                  {
                    backgroundColor: palette.surfaceBeige,
                    borderColor: palette.borderLatte,
                  },
                ]}
              >
                <View style={styles.cardHeaderRow}>
                  <View style={styles.nameSection}>
                    <View
                      style={[
                        styles.avatarCircle,
                        { backgroundColor: palette.primaryBrown },
                      ]}
                    >
                      <Text
                        style={[
                          styles.avatarInitial,
                          { color: palette.textOnPrimary },
                        ]}
                      >
                        {contact.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.customerName,
                          { color: palette.textEspresso },
                        ]}
                      >
                        {contact.displayName}
                      </Text>
                      <Text
                        style={[
                          styles.customerNote,
                          { color: palette.textMocha },
                        ]}
                      >
                        {contact.titleOrNote}
                      </Text>
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={[
                        styles.directionMiniTag,
                        {
                          color: isReceivable
                            ? palette.receiveSageGreen
                            : palette.giveTerracottaRed,
                        },
                      ]}
                    >
                      {isReceivable ? 'YOU WILL GET' : 'YOU WILL GIVE'}
                    </Text>
                    <Text
                      style={[
                        styles.remainingAmount,
                        {
                          color: isReceivable
                            ? palette.receiveSageGreen
                            : palette.giveTerracottaRed,
                        },
                      ]}
                    >
                      {formatINR(contact.remainingPaise)}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.breakdownBar,
                    {
                      backgroundColor: palette.surfaceElevated,
                      borderColor: palette.borderLatte,
                    },
                  ]}
                >
                  <Text
                    style={[styles.breakdownText, { color: palette.textMocha }]}
                  >
                    Original:{' '}
                    <Text
                      style={{ fontWeight: '700', color: palette.textEspresso }}
                    >
                      {formatINR(contact.principalPaise)}
                    </Text>
                  </Text>
                  <Text
                    style={[styles.breakdownText, { color: palette.textMocha }]}
                  >
                    Paid:{' '}
                    <Text
                      style={{
                        fontWeight: '700',
                        color: palette.receiveSageGreen,
                      }}
                    >
                      {formatINR(contact.repaidPaise)}
                    </Text>
                  </Text>
                  <Text
                    style={[styles.breakdownText, { color: palette.textMocha }]}
                  >
                    Remaining:{' '}
                    <Text
                      style={{
                        fontWeight: '800',
                        color: palette.giveTerracottaRed,
                      }}
                    >
                      {formatINR(contact.remainingPaise)}
                    </Text>
                  </Text>
                </View>

                <View style={styles.cardFooterRow}>
                  <View style={styles.badgeGroup}>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: badgeColor },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          { color: palette.textOnPrimary },
                        ]}
                      >
                        {contact.status === 'SETTLED'
                          ? '✅ SETTLED'
                          : contact.dueTag === 'OVERDUE'
                            ? `🚨 OVERDUE (${contact.dueDate})`
                            : contact.dueTag === 'DUE_TODAY'
                              ? `⏰ DUE TODAY (${contact.dueDate})`
                              : `📅 Due: ${contact.dueDate}`}
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.partialTagText,
                        { color: palette.textMocha },
                      ]}
                    >
                      {contact.status}
                    </Text>
                  </View>

                  {isReceivable && contact.remainingPaise > 0 && (
                    <TouchableOpacity
                      onPress={() => handleDirectWhatsAppRemind(contact)}
                      style={[
                        styles.remindButton,
                        {
                          backgroundColor: palette.receiveSageTint,
                          borderColor: palette.receiveSageGreen,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.remindButtonText,
                          { color: palette.receiveSageGreen },
                        ]}
                      >
                        💬 Remind
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Modal: Create New Udhaar Obligation via React Query Mutation */}
      <Modal visible={showNewUdhaarModal} transparent animationType="slide">
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
              Naya Customer / Supplier Udhaar
            </Text>

            <View style={styles.dirRow}>
              <TouchableOpacity
                onPress={() => setDirection('RECEIVABLE')}
                style={[
                  styles.dirBtn,
                  {
                    backgroundColor:
                      direction === 'RECEIVABLE'
                        ? palette.receiveSageGreen
                        : palette.surfaceElevated,
                    borderColor: palette.borderLatte,
                  },
                ]}
              >
                <Text
                  style={{
                    fontWeight: '800',
                    fontSize: 12,
                    color:
                      direction === 'RECEIVABLE'
                        ? palette.textOnPrimary
                        : palette.textEspresso,
                  }}
                >
                  🔴 Udhaar Diya (Will Get)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setDirection('PAYABLE')}
                style={[
                  styles.dirBtn,
                  {
                    backgroundColor:
                      direction === 'PAYABLE'
                        ? palette.giveTerracottaRed
                        : palette.surfaceElevated,
                    borderColor: palette.borderLatte,
                  },
                ]}
              >
                <Text
                  style={{
                    fontWeight: '800',
                    fontSize: 12,
                    color:
                      direction === 'PAYABLE'
                        ? palette.textOnPrimary
                        : palette.textEspresso,
                  }}
                >
                  🟢 Udhaar Liya (Will Give)
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: palette.textEspresso }]}>
              Customer / Supplier Name
            </Text>
            <TextInput
              value={contactName}
              onChangeText={setContactName}
              placeholder="Enter customer or supplier name"
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
              Phone Number (for WhatsApp Reminder)
            </Text>
            <TextInput
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="+91..."
              keyboardType="phone-pad"
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
              Amount (in ₹ Rupees)
            </Text>
            <TextInput
              value={principalRupees}
              onChangeText={setPrincipalRupees}
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
              Due Date (YYYY-MM-DD) & Note
            </Text>
            <TextInput
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.textMocha}
              style={[
                styles.input,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.borderLatte,
                  color: palette.textEspresso,
                  marginBottom: 8,
                },
              ]}
            />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Items or bill note"
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
                onPress={() => setShowNewUdhaarModal(false)}
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
                onPress={handleCreateUdhaar}
                disabled={createObligationMutation.isPending}
                style={[
                  styles.saveBtn,
                  { backgroundColor: palette.primaryBrown },
                ]}
              >
                <Text
                  style={{ color: palette.textOnPrimary, fontWeight: '800' }}
                >
                  {createObligationMutation.isPending
                    ? 'Saving...'
                    : '✅ Confirm & Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Polite Reminder Modal (Hinglish / Hindi / English) */}
      <PoliteReminderModal
        visible={reminderTarget !== null}
        target={reminderTarget}
        onClose={() => setReminderTarget(null)}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 110,
    gap: 14,
  },
  mahoganyBanner: {
    borderRadius: 18,
    padding: 16,
    gap: 14,
  },
  bannerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bannerTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  bannerTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
  },
  addCustomerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addCustomerBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  summaryCardsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryBox: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  summaryBoxLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  summaryBoxAmount: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 4,
  },
  summaryBoxSub: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: '600',
  },
  dueAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  dueAlertTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  dueAlertSub: {
    fontSize: 11,
    marginTop: 2,
  },
  filterRow: {
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  listContainer: {
    gap: 12,
  },
  customerCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '800',
  },
  customerName: {
    fontSize: 15,
    fontWeight: '800',
  },
  customerNote: {
    fontSize: 12,
    marginTop: 2,
  },
  directionMiniTag: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  remainingAmount: {
    fontSize: 18,
    fontWeight: '900',
  },
  breakdownBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  breakdownText: {
    fontSize: 11,
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  partialTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  remindButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  remindButtonText: {
    fontSize: 12,
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
  dirRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  dirBtn: {
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
    marginTop: 18,
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
