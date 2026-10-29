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
      {/* 1. Clean Udhaar Ledger Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryTopRow}>
          <Text style={styles.summaryTitle}>Udhaar Khata Summary</Text>
          <TouchableOpacity
            onPress={() => setShowNewUdhaarModal(true)}
            style={[
              styles.addBtn,
              { backgroundColor: palette.primaryBrown },
            ]}
          >
            <Text style={styles.addBtnText}>+ New Udhaar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>You Will Get</Text>
            <Text style={styles.willGetValue}>
              {formatINR(summary?.totalWillGetPaise || 0)}
            </Text>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>You Will Give</Text>
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

      {/* 2. Minimal Filter Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {(
          [
            { id: 'ALL', label: 'All' },
            { id: 'OVERDUE', label: 'Overdue' },
            { id: 'DUE_TODAY', label: 'Due Today' },
            { id: 'CUSTOMERS', label: 'Customers' },
            { id: 'SUPPLIERS', label: 'Suppliers' },
          ] as { id: FilterChip; label: string }[]
        ).map((chip) => {
          const isSelected = activeFilter === chip.id;
          return (
            <TouchableOpacity
              key={chip.id}
              onPress={() => setActiveFilter(chip.id)}
              style={[
                styles.filterChip,
                isSelected && {
                  backgroundColor: palette.primaryBrown,
                  borderColor: palette.primaryBrown,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: isSelected ? '#FFFFFF' : '#475569',
                }}
              >
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 3. Streamlined Passbook Account Rows */}
      <View style={styles.ledgerContainer}>
        <View style={styles.ledgerHeaderBar}>
          <Text style={styles.ledgerHeaderLeft}>Account / Due Date</Text>
          <Text style={styles.ledgerHeaderRight}>Remaining Balance</Text>
        </View>

        {filteredContacts.length === 0 ? (
          <View style={{ padding: 16 }}>
            <EmptyStateCard
              title="No Udhaar Accounts"
              message="No accounts match this filter. Add your first customer or supplier entry."
              actionLabel="+ New Udhaar"
              onActionPress={() => setShowNewUdhaarModal(true)}
            />
          </View>
        ) : (
          filteredContacts.map((contact) => {
            const isReceivable = contact.direction === 'RECEIVABLE';
            return (
              <TouchableOpacity
                key={contact.obligationId}
                activeOpacity={0.85}
                onPress={() => onOpenContactDetail(contact.contactId)}
                style={styles.accountRow}
              >
                <View style={styles.accountLeft}>
                  <Text style={styles.accountName} numberOfLines={1}>
                    {contact.displayName}
                  </Text>
                  <Text style={styles.accountSubtleMeta} numberOfLines={1}>
                    Due {contact.dueDate} • Paid {formatINR(contact.repaidPaise)}{' '}
                    of {formatINR(contact.principalPaise)}
                  </Text>
                </View>

                <View style={styles.accountRight}>
                  <Text
                    style={[
                      styles.accountAmount,
                      { color: isReceivable ? '#15803D' : '#B91C1C' },
                    ]}
                  >
                    {isReceivable ? '+ ' : '- '}
                    {formatINR(contact.remainingPaise)}
                  </Text>

                  {isReceivable && contact.remainingPaise > 0 && (
                    <TouchableOpacity
                      onPress={() => handleOpenRemind(contact)}
                      style={styles.remindLinkBtn}
                    >
                      <Text style={styles.remindLinkText}>Remind</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Clean Modal: Create New Udhaar */}
      <Modal visible={showNewUdhaarModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Udhaar Entry</Text>

            <View style={styles.dirRow}>
              <TouchableOpacity
                onPress={() => setDirection('RECEIVABLE')}
                style={[
                  styles.dirBtn,
                  direction === 'RECEIVABLE' && {
                    backgroundColor: '#15803D',
                    borderColor: '#15803D',
                  },
                ]}
              >
                <Text
                  style={{
                    fontWeight: '600',
                    fontSize: 12,
                    color: direction === 'RECEIVABLE' ? '#FFFFFF' : '#0F172A',
                  }}
                >
                  You Gave (Will Get)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setDirection('PAYABLE')}
                style={[
                  styles.dirBtn,
                  direction === 'PAYABLE' && {
                    backgroundColor: '#B91C1C',
                    borderColor: '#B91C1C',
                  },
                ]}
              >
                <Text
                  style={{
                    fontWeight: '600',
                    fontSize: 12,
                    color: direction === 'PAYABLE' ? '#FFFFFF' : '#0F172A',
                  }}
                >
                  You Got (Will Give)
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              value={contactName}
              onChangeText={setContactName}
              placeholder="Customer or Supplier name"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="+91..."
              keyboardType="phone-pad"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Amount (₹)</Text>
            <TextInput
              value={principalRupees}
              onChangeText={setPrincipalRupees}
              placeholder="0.00"
              keyboardType="numeric"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Due Date (YYYY-MM-DD)</Text>
            <TextInput
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Note</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Bill or item description"
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
                    : 'Confirm & Save'}
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
  summaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricCol: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 3,
  },
  willGetValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#15803D',
  },
  willGiveValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#B91C1C',
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
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: '500',
  },
  filterRow: {
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  ledgerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  ledgerHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  ledgerHeaderLeft: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  ledgerHeaderRight: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  accountLeft: {
    flex: 1,
    paddingRight: 12,
  },
  accountName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  accountSubtleMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  accountRight: {
    alignItems: 'flex-end',
  },
  accountAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  remindLinkBtn: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
  },
  remindLinkText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  dirRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0F172A',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: 13,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
});
