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
  useContactDetail,
  useRecordLedgerEntry,
} from '../hooks/useFinTrackQueries';
import { PaymentChannel } from '../types/ledger';
import { formatINR, paiseToRupees } from '../utils/paise';
import {
  SkeletonLoader,
  EmptyStateCard,
  ErrorRetryCard,
} from '../components/QueryStateViews';
import {
  PoliteReminderModal,
  ReminderTargetInfo,
} from '../components/PoliteReminderModal';

interface CustomerDetailProps {
  contactId: string;
  onBack: () => void;
}

export const CustomerDetailScreen: React.FC<CustomerDetailProps> = ({
  contactId,
  onBack,
}) => {
  const { activeWorkspaceId } = useFinTrackTheme();

  // Live TanStack React Query Hooks
  const detailQuery = useContactDetail(activeWorkspaceId, contactId);
  const recordEntryMutation = useRecordLedgerEntry(
    activeWorkspaceId,
    contactId
  );

  const [entryModalAction, setEntryModalAction] = useState<'GAVE' | 'GOT' | null>(
    null
  );
  const [amountRupees, setAmountRupees] = useState('');
  const [paymentVia, setPaymentVia] = useState<PaymentChannel>('UPI');
  const [note, setNote] = useState('');
  const [reminderTarget, setReminderTarget] =
    useState<ReminderTargetInfo | null>(null);

  // 1. Loading State
  if (detailQuery.isLoading) {
    return (
      <View style={[styles.container, { padding: 16 }]}>
        <SkeletonLoader count={4} height={72} />
      </View>
    );
  }

  // 2. Error State
  if (detailQuery.isError || !detailQuery.data) {
    const errMsg =
      detailQuery.error instanceof Error
        ? detailQuery.error.message
        : 'Could not load contact ledger timeline from server.';
    return (
      <View style={[styles.container, { padding: 16 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back to Khata</Text>
        </TouchableOpacity>
        <ErrorRetryCard
          errorMessage={errMsg}
          onRetry={() => detailQuery.refetch()}
        />
      </View>
    );
  }

  const { contact, obligation, entries } = detailQuery.data;
  const isReceivable = obligation?.direction !== 'PAYABLE';
  const principalPaise = obligation?.principalPaise || 0;
  const repaidPaise = obligation?.repaidPaise || 0;
  const remainingPaise = obligation?.remainingPaise || 0;
  const remainingRupeesNumber = paiseToRupees(remainingPaise);

  const handleConfirmEntry = async () => {
    if (
      !entryModalAction ||
      !obligation ||
      !amountRupees.trim() ||
      Number(amountRupees) <= 0
    ) {
      return;
    }

    await recordEntryMutation.mutateAsync({
      obligationId: obligation.id,
      action: entryModalAction,
      amountRupees: amountRupees.trim(),
      paymentVia,
      note: note.trim(),
    });

    setAmountRupees('');
    setNote('');
    setEntryModalAction(null);
  };

  const handleWhatsAppRemind = () => {
    if (!obligation) return;
    setReminderTarget({
      obligationId: obligation.id,
      contactId: contact.id,
      contactName: contact.displayName,
      phoneNumber: contact.phoneNumber,
      remainingPaise,
      dueDate: obligation.dueDate,
    });
  };

  return (
    <View style={styles.container}>
      {/* 1. Clean Passbook Account Header */}
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          <TouchableOpacity onPress={onBack} style={styles.backPill}>
            <Text style={styles.backPillText}>← Back</Text>
          </TouchableOpacity>

          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.contactTitle}>{contact.displayName}</Text>
            <Text style={styles.contactSub}>
              {contact.phoneNumber} • Due: {obligation?.dueDate || 'N/A'}
            </Text>
          </View>

          {remainingPaise > 0 && (
            <TouchableOpacity
              onPress={handleWhatsAppRemind}
              style={styles.waHeaderBtn}
            >
              <Text style={styles.waHeaderBtnText}>Remind</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Partial Payment Math Summary Strip */}
        <View style={styles.mathSummaryCard}>
          <View style={styles.mathCol}>
            <Text style={styles.mathColLabel}>Principal</Text>
            <Text style={styles.mathColVal}>{formatINR(principalPaise)}</Text>
          </View>

          <View style={styles.verticalDivider} />

          <View style={styles.mathCol}>
            <Text style={styles.mathColLabel}>Settled</Text>
            <Text style={[styles.mathColVal, { color: '#15803D' }]}>
              {formatINR(repaidPaise)}
            </Text>
          </View>

          <View style={styles.verticalDivider} />

          <View style={styles.mathCol}>
            <Text style={styles.mathColLabel}>
              Balance ({obligation?.status || 'OPEN'})
            </Text>
            <Text
              style={[
                styles.mathColVal,
                {
                  color:
                    remainingPaise === 0
                      ? '#15803D'
                      : isReceivable
                        ? '#B91C1C'
                        : '#0F172A',
                },
              ]}
            >
              {formatINR(remainingPaise)}
            </Text>
          </View>
        </View>
      </View>

      {/* 2. Passbook Ledger Statement Rows */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statementHeaderBar}>
          <Text style={styles.statementHeaderText}>ACCOUNT LEDGER ENTRIES</Text>
          <Text style={styles.statementHeaderText}>AMOUNT / BALANCE</Text>
        </View>

        {entries.length === 0 ? (
          <View style={{ padding: 16 }}>
            <EmptyStateCard
              title="No Ledger Entries Yet"
              message="Use the buttons below to record Udhaar Diya (Gave) or Wapas Mila (Got)."
            />
          </View>
        ) : (
          <View style={styles.passbookCard}>
            {entries.map((entry, idx) => {
              const isGave = entry.bubbleSide === 'GAVE';
              return (
                <View
                  key={entry.id}
                  style={[
                    styles.ledgerRow,
                    idx < entries.length - 1 && styles.ledgerRowDivider,
                  ]}
                >
                  {/* Left Side: Description + Payment Mode & Time */}
                  <View style={styles.rowLeft}>
                    <Text style={styles.entryTitle} numberOfLines={1}>
                      {entry.note || (isGave ? 'Udhaar Given' : 'Payment Received')}
                    </Text>
                    <Text style={styles.entrySub} numberOfLines={1}>
                      {entry.paymentVia} • {entry.occurredAt}
                    </Text>
                  </View>

                  {/* Right Side: Signed Amount & Running Balance */}
                  <View style={styles.rowRight}>
                    <Text
                      style={[
                        styles.entryAmount,
                        { color: isGave ? '#B91C1C' : '#15803D' },
                      ]}
                    >
                      {isGave ? '- ' : '+ '}
                      {formatINR(entry.amountPaise)}
                    </Text>
                    <Text style={styles.runningBalText}>
                      Bal: {formatINR(entry.runningRemainingPaise)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* 3. Bottom Action Bar */}
      <View style={styles.bottomActionContainer}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            setAmountRupees('');
            setEntryModalAction('GAVE');
          }}
          style={[styles.actionButton, { backgroundColor: '#B91C1C' }]}
        >
          <Text style={styles.actionBtnTitle}>Udhaar Diya (-)</Text>
          <Text style={styles.actionBtnSub}>You Gave (₹)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            setAmountRupees(
              remainingRupeesNumber > 0 ? String(remainingRupeesNumber) : ''
            );
            setEntryModalAction('GOT');
          }}
          style={[styles.actionButton, { backgroundColor: '#15803D' }]}
        >
          <Text style={styles.actionBtnTitle}>Wapas Mila (+)</Text>
          <Text style={styles.actionBtnSub}>You Got / Settle (₹)</Text>
        </TouchableOpacity>
      </View>

      {/* Partial Repayment / Additional Udhaar Modal */}
      <Modal
        visible={entryModalAction !== null}
        transparent
        animationType="slide"
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {entryModalAction === 'GOT'
                ? `Wapas Mila from ${contact.displayName}`
                : `Udhaar Diya to ${contact.displayName}`}
            </Text>

            <Text style={styles.modalSub}>
              Current Balance: {formatINR(remainingPaise)}
            </Text>

            <Text style={styles.inputLabel}>Amount (₹ Rupees)</Text>
            <TextInput
              value={amountRupees}
              onChangeText={setAmountRupees}
              keyboardType="numeric"
              placeholder="Enter amount"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Payment Mode</Text>
            <View style={styles.modeRow}>
              {(['UPI', 'CASH', 'BANK_TRANSFER'] as PaymentChannel[]).map(
                (ch) => (
                  <TouchableOpacity
                    key={ch}
                    onPress={() => setPaymentVia(ch)}
                    style={[
                      styles.modeBtn,
                      paymentVia === ch && styles.modeBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.modeBtnText,
                        paymentVia === ch && styles.modeBtnTextActive,
                      ]}
                    >
                      {ch}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>

            <Text style={styles.inputLabel}>Note / Description</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Enter note"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setEntryModalAction(null)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleConfirmEntry}
                disabled={recordEntryMutation.isPending}
                style={[
                  styles.confirmBtn,
                  {
                    backgroundColor:
                      entryModalAction === 'GOT' ? '#15803D' : '#B91C1C',
                  },
                ]}
              >
                <Text style={styles.confirmBtnText}>
                  {recordEntryMutation.isPending
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  backBtn: {
    paddingVertical: 10,
  },
  backBtnText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 13,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 12,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  contactSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  waHeaderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  waHeaderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  mathSummaryCard: {
    flexDirection: 'row',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mathCol: {
    flex: 1,
    alignItems: 'center',
  },
  mathColLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  mathColVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  verticalDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  statementHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  statementHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.4,
  },
  passbookCard: {
    backgroundColor: '#FFFFFF',
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  ledgerRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rowLeft: {
    flex: 1,
    paddingRight: 12,
  },
  entryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  entrySub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  entryAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  runningBalText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
  },
  bottomActionContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionBtnSub: {
    fontSize: 11,
    marginTop: 1,
    color: '#F8FAFC',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginTop: 10,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  modeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  modeBtnTextActive: {
    color: '#FFFFFF',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 13,
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
