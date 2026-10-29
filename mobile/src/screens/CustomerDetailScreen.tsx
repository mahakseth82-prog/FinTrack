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
import { MinimalIcon } from '../components/MinimalIcon';
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

  if (detailQuery.isLoading) {
    return (
      <View style={[styles.container, { padding: 16 }]}>
        <SkeletonLoader count={4} height={72} />
      </View>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    const errMsg =
      detailQuery.error instanceof Error
        ? detailQuery.error.message
        : 'Unable to load account ledger entries.';
    return (
      <View style={[styles.container, { padding: 16 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Back to Ledger</Text>
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
      {/* 1. Executive Account Header */}
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          <TouchableOpacity onPress={onBack} style={styles.backPill}>
            <MinimalIcon name="arrow-left" size={14} color="#0F172A" />
            <Text style={styles.backPillText}>Back</Text>
          </TouchableOpacity>

          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.contactTitle}>{contact.displayName}</Text>
            <Text style={styles.contactSub}>
              {contact.phoneNumber} • Due {obligation?.dueDate || 'N/A'}
            </Text>
          </View>

          {remainingPaise > 0 && (
            <TouchableOpacity
              onPress={handleWhatsAppRemind}
              style={styles.waHeaderBtn}
            >
              <Text style={styles.waHeaderBtnText}>Send Notice</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Balance Breakdown Strip */}
        <View style={styles.mathSummaryCard}>
          <View style={styles.mathCol}>
            <Text style={styles.mathColLabel}>Principal</Text>
            <Text style={styles.mathColVal}>{formatINR(principalPaise)}</Text>
          </View>

          <View style={styles.verticalDivider} />

          <View style={styles.mathCol}>
            <Text style={styles.mathColLabel}>Settled</Text>
            <Text style={[styles.mathColVal, { color: '#065F46' }]}>
              {formatINR(repaidPaise)}
            </Text>
          </View>

          <View style={styles.verticalDivider} />

          <View style={styles.mathCol}>
            <Text style={styles.mathColLabel}>
              Outstanding ({obligation?.status || 'OPEN'})
            </Text>
            <Text
              style={[
                styles.mathColVal,
                {
                  color:
                    remainingPaise === 0
                      ? '#065F46'
                      : isReceivable
                        ? '#991B1B'
                        : '#0F172A',
                },
              ]}
            >
              {formatINR(remainingPaise)}
            </Text>
          </View>
        </View>
      </View>

      {/* 2. Executive Ledger Statement Rows */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statementHeaderBar}>
          <Text style={styles.statementHeaderText}>LEDGER STATEMENT</Text>
          <Text style={styles.statementHeaderText}>AMOUNT / BALANCE</Text>
        </View>

        {entries.length === 0 ? (
          <View style={{ padding: 16 }}>
            <EmptyStateCard
              title="No Ledger Entries"
              message="Use the actions below to record credit extended or payments received."
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
                  <View style={styles.rowLeft}>
                    <Text style={styles.entryTitle} numberOfLines={1}>
                      {entry.note || (isGave ? 'Credit Extended' : 'Payment Received')}
                    </Text>
                    <Text style={styles.entrySub} numberOfLines={1}>
                      {entry.paymentVia === 'CASH'
                        ? entry.occurredAt
                        : `${entry.paymentVia} • ${entry.occurredAt}`}
                    </Text>
                  </View>

                  <View style={styles.rowRight}>
                    <Text
                      style={[
                        styles.entryAmount,
                        { color: isGave ? '#991B1B' : '#065F46' },
                      ]}
                    >
                      {isGave ? '-' : '+'}
                      {formatINR(entry.amountPaise, true)}
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
          style={[styles.actionButton, { backgroundColor: '#991B1B' }]}
        >
          <Text style={styles.actionBtnTitle}>Extend Credit (-)</Text>
          <Text style={styles.actionBtnSub}>Record Outflow</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            setAmountRupees(
              remainingRupeesNumber > 0 ? String(remainingRupeesNumber) : ''
            );
            setEntryModalAction('GOT');
          }}
          style={[styles.actionButton, { backgroundColor: '#065F46' }]}
        >
          <Text style={styles.actionBtnTitle}>Receive Payment (+)</Text>
          <Text style={styles.actionBtnSub}>Record Settlement</Text>
        </TouchableOpacity>
      </View>

      {/* Modal: Record Ledger Entry */}
      <Modal
        visible={entryModalAction !== null}
        transparent
        animationType="slide"
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {entryModalAction === 'GOT'
                ? `Receive Payment from ${contact.displayName}`
                : `Extend Credit to ${contact.displayName}`}
            </Text>

            <Text style={styles.modalSub}>
              Outstanding Balance: {formatINR(remainingPaise)}
            </Text>

            <Text style={styles.inputLabel}>Amount (INR)</Text>
            <TextInput
              value={amountRupees}
              onChangeText={setAmountRupees}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Payment Method</Text>
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

            <Text style={styles.inputLabel}>Reference / Description</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Enter description"
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
                      entryModalAction === 'GOT' ? '#065F46' : '#991B1B',
                  },
                ]}
              >
                <Text style={styles.confirmBtnText}>
                  {recordEntryMutation.isPending ? 'Saving...' : 'Save Entry'}
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
    fontFamily: SYSTEM_FONT_STACK,
    color: '#0F172A',
    fontWeight: '600',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backPillText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  contactTitle: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  contactSub: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  waHeaderBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  waHeaderBtnText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '600',
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
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  mathColVal: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
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
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  statementHeaderText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 15,
    fontWeight: '500',
    color: '#0F172A',
  },
  entrySub: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '400',
    color: '#94A3B8',
    marginTop: 3,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  entryAmount: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  runningBalText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
    fontVariant: ['tabular-nums'],
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
    borderRadius: 6,
    alignItems: 'center',
  },
  actionBtnTitle: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionBtnSub: {
    fontFamily: SYSTEM_FONT_STACK,
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
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    padding: 20,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalTitle: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  modalSub: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 12,
  },
  inputLabel: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
    marginTop: 10,
    marginBottom: 5,
  },
  input: {
    fontFamily: SYSTEM_FONT_STACK,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
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
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  modeBtnText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 11,
    fontWeight: '600',
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
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: SYSTEM_FONT_STACK,
    color: '#475569',
    fontWeight: '600',
    fontSize: 13,
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 6,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontFamily: SYSTEM_FONT_STACK,
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
});
