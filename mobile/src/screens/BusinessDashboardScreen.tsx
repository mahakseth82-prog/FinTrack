import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import { SYSTEM_FONT_STACK } from '../theme/colors';
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
        : 'Unable to load credit & receivables ledger.';
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
      {/* 1. Credit & Receivables Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryTopRow}>
          <Text style={styles.sectionHeader}>CREDIT & RECEIVABLES</Text>
          <TouchableOpacity
            onPress={() => setShowNewUdhaarModal(true)}
            style={[
              styles.addBtn,
              { backgroundColor: palette.primaryBrown },
            ]}
          >
            <Text style={styles.addBtnText}>New Account</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Total Receivable</Text>
            <Text style={styles.willGetValue}>
              {formatINR(summary?.totalWillGetPaise || 0)}
            </Text>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Total Payable</Text>
            <Text style={styles.willGiveValue}>
              {formatINR(summary?.totalWillGivePaise || 0)}
            </Text>
          </View>
        </View>

        {(dueRemindersQuery.data?.dueSoonCount || 0) > 0 && (
          <View style={styles.dueStrip}>
            <Text style={styles.dueStripText}>
              {dueRemindersQuery.data?.dueSoonCount} account(s) due within 24h
              or overdue
            </Text>
          </View>
        )}
      </View>

      {/* 2. Segmented Filter Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {(
          [
            { id: 'ALL', label: 'All Accounts' },
            { id: 'OVERDUE', label: 'Overdue' },
            { id: 'DUE_TODAY', label: 'Due Today' },
            { id: 'CUSTOMERS', label: 'Receivables' },
            { id: 'SUPPLIERS', label: 'Payables' },
          ] as { id: FilterChip; label: string }[]
        ).map((chip) => {
          const isActive = activeFilter === chip.id;
          return (
            <TouchableOpacity
              key={chip.id}
              onPress={() => setActiveFilter(chip.id)}
              style={[
                styles.filterChip,
                isActive && {
                  backgroundColor: palette.primaryBrown,
                  borderColor: palette.primaryBrown,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: isActive ? '#FFFFFF' : '#475569' },
                ]}
              >
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 3. Executive Ledger Accounts List */}
      <View style={styles.passbookCard}>
        <View style={styles.passbookHeaderRow}>
          <Text style={styles.sectionHeader}>
            LEDGER ACCOUNTS ({filteredContacts.length})
          </Text>
        </View>

        {filteredContacts.length === 0 ? (
          <View style={{ padding: 16 }}>
            <EmptyStateCard
              title="No Active Accounts"
              message="No receivables or payables match this filter."
              actionLabel="New Account"
              onActionPress={() => setShowNewUdhaarModal(true)}
            />
          </View>
        ) : (
          filteredContacts.map((contact) => {
            const isReceivable = contact.direction === 'RECEIVABLE';
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
                      isOverdue && { color: '#991B1B', fontWeight: '500' },
                    ]}
                    numberOfLines={1}
                  >
                    Due {contact.dueDate}
                    {isOverdue ? ' (Overdue)' : ''} • Paid{' '}
                    {formatINR(contact.repaidPaise)} of{' '}
                    {formatINR(contact.principalPaise)}
                  </Text>
                </View>

                <View style={styles.accountRowRight}>
                  <Text
                    style={[
                      styles.balanceAmountText,
                      {
                        color: isReceivable ? '#065F46' : '#991B1B',
                      },
                    ]}
                  >
                    {isReceivable ? '+' : '-'}
                    {formatINR(contact.remainingPaise, true)}
                  </Text>

                  {isReceivable && contact.remainingPaise > 0 && (
                    <TouchableOpacity
                      onPress={() => handleOpenRemind(contact)}
                      style={styles.remindLinkBtn}
                    >
                      <Text style={styles.remindLinkText}>Notify</Text>
                    </TouchableOpacity>
                  )}
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
            <Text style={styles.modalTitle}>New Ledger Account</Text>

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
                    fontWeight: '600',
                    color: direction === 'RECEIVABLE' ? '#FFFFFF' : '#0F172A',
                  }}
                >
                  Receivable (Credit Given)
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
                    fontWeight: '600',
                    color: direction === 'PAYABLE' ? '#FFFFFF' : '#0F172A',
                  }}
                >
                  Payable (Credit Taken)
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Counterparty Name</Text>
            <TextInput
              value={contactName}
              onChangeText={setContactName}
              placeholder="e.g. Ravi Sharma"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              placeholder="+919876543210"
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
              placeholder="Invoice or description"
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
                  { backgroundColor: palette.primaryBrown },
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
    padding: 14,
    paddingBottom: 90,
    gap: 12,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeader: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.65,
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addBtnText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricCol: {
    flex: 1,
  },
  metricLabel: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 3,
  },
  willGetValue: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 18,
    fontWeight: '600',
    color: '#065F46',
    fontVariant: ['tabular-nums'],
  },
  willGiveValue: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 18,
    fontWeight: '600',
    color: '#991B1B',
    fontVariant: ['tabular-nums'],
  },
  metricDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 14,
  },
  dueStrip: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  dueStripText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '500',
  },
  filterRow: {
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '600',
  },
  passbookCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  passbookHeaderRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
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
    paddingRight: 12,
  },
  contactNameText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 15,
    fontWeight: '500',
    color: '#0F172A',
  },
  contactMetaText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '400',
    color: '#94A3B8',
    marginTop: 3,
  },
  accountRowRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  balanceAmountText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  remindLinkBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  remindLinkText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalTitle: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 16,
    fontWeight: '600',
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
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  inputLabel: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    fontFamily: SYSTEM_FONT_STACK,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
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
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
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
    borderRadius: 6,
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
