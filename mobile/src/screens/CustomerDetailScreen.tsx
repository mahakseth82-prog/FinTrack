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
  const { palette, activeWorkspaceId } = useFinTrackTheme();

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
      <View
        style={[
          styles.container,
          { backgroundColor: palette.backgroundCream, padding: 16 },
        ]}
      >
        <SkeletonLoader count={4} height={95} />
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
      <View
        style={[
          styles.container,
          { backgroundColor: palette.backgroundCream, padding: 16 },
        ]}
      >
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={{ color: palette.primaryBrown, fontWeight: '800' }}>
            ← Back to Khata
          </Text>
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
    <View
      style={[
        styles.container,
        { backgroundColor: palette.backgroundCream },
      ]}
    >
      {/* 1. Customer Header Bar */}
      <View
        style={[
          styles.topBar,
          { backgroundColor: palette.primaryBrown },
        ]}
      >
        <View style={styles.topBarRow}>
          <TouchableOpacity onPress={onBack} style={styles.backPill}>
            <Text style={[styles.backPillText, { color: palette.textOnPrimary }]}>
              ← Back
            </Text>
          </TouchableOpacity>

          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.contactTitle, { color: palette.textOnPrimary }]}>
              {contact.displayName}
            </Text>
            <Text style={[styles.contactSub, { color: palette.surfaceBeige }]}>
              {contact.phoneNumber} • Due: {obligation?.dueDate || 'N/A'}
            </Text>
          </View>

          {remainingPaise > 0 && (
            <TouchableOpacity
              onPress={handleWhatsAppRemind}
              style={[
                styles.waHeaderBtn,
                { backgroundColor: palette.accentWarm },
              ]}
            >
              <Text
                style={[styles.waHeaderBtnText, { color: palette.textEspresso }]}
              >
                💬 Remind
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Partial Payment Math Summary Strip */}
        <View
          style={[
            styles.mathSummaryCard,
            { backgroundColor: palette.surfaceBeige },
          ]}
        >
          <View style={styles.mathCol}>
            <Text style={[styles.mathColLabel, { color: palette.textMocha }]}>
              Original Principal
            </Text>
            <Text style={[styles.mathColVal, { color: palette.textEspresso }]}>
              {formatINR(principalPaise)}
            </Text>
          </View>

          <View
            style={[
              styles.verticalDivider,
              { backgroundColor: palette.borderLatte },
            ]}
          />

          <View style={styles.mathCol}>
            <Text style={[styles.mathColLabel, { color: palette.textMocha }]}>
              Wapas Mila (Paid)
            </Text>
            <Text
              style={[styles.mathColVal, { color: palette.receiveSageGreen }]}
            >
              {formatINR(repaidPaise)}
            </Text>
          </View>

          <View
            style={[
              styles.verticalDivider,
              { backgroundColor: palette.borderLatte },
            ]}
          />

          <View style={styles.mathCol}>
            <Text style={[styles.mathColLabel, { color: palette.textMocha }]}>
              Remaining ({obligation?.status || 'OPEN'})
            </Text>
            <Text
              style={[
                styles.mathColVal,
                {
                  color:
                    remainingPaise === 0
                      ? palette.receiveSageGreen
                      : isReceivable
                        ? palette.giveTerracottaRed
                        : palette.warningAmber,
                },
              ]}
            >
              {formatINR(remainingPaise)}
            </Text>
          </View>
        </View>
      </View>

      {/* 2. WhatsApp-Style Chat Ledger Timeline */}
      <ScrollView
        contentContainerStyle={styles.chatScroll}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.EncryptedNotice,
            {
              backgroundColor: palette.surfaceBeige,
              borderColor: palette.borderLatte,
            },
          ]}
        >
          <Text style={[styles.encryptedText, { color: palette.textMocha }]}>
            🔒 Exact Integer Paise Ledger • Left Red = Udhaar Diya (Gave) | Right
            Green = Wapas Mila (Got)
          </Text>
        </View>

        {entries.length === 0 ? (
          <EmptyStateCard
            emoji="💬"
            title="No Ledger Entries Yet"
            message="Use the buttons below to record Udhaar Diya (Gave) or Wapas Mila (Got)."
          />
        ) : (
          entries.map((entry) => {
            const isLeftGave = entry.bubbleSide === 'GAVE';
            return (
              <View
                key={entry.id}
                style={[
                  styles.bubbleWrapper,
                  isLeftGave ? styles.alignLeft : styles.alignRight,
                ]}
              >
                <View
                  style={[
                    styles.chatBubble,
                    isLeftGave
                      ? {
                          backgroundColor: palette.giveTerracottaTint,
                          borderColor: palette.giveTerracottaRed,
                          borderTopLeftRadius: 4,
                        }
                      : {
                          backgroundColor: palette.receiveSageTint,
                          borderColor: palette.receiveSageGreen,
                          borderTopRightRadius: 4,
                        },
                  ]}
                >
                  <View style={styles.bubbleHeaderRow}>
                    <Text
                      style={[
                        styles.bubbleDirectionLabel,
                        {
                          color: isLeftGave
                            ? palette.giveTerracottaRed
                            : palette.receiveSageGreen,
                        },
                      ]}
                    >
                      {isLeftGave
                        ? '🔴 UDHAAR DIYA (YOU GAVE)'
                        : '🟢 WAPAS MILA (YOU GOT)'}
                    </Text>
                    <Text
                      style={[
                        styles.bubbleViaBadge,
                        { color: palette.textMocha },
                      ]}
                    >
                      via {entry.paymentVia}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.bubbleAmount,
                      {
                        color: isLeftGave
                          ? palette.giveTerracottaRed
                          : palette.receiveSageGreen,
                      },
                    ]}
                  >
                    {formatINR(entry.amountPaise)}
                  </Text>

                  <Text
                    style={[styles.bubbleNote, { color: palette.textEspresso }]}
                  >
                    {entry.note}
                  </Text>

                  <View
                    style={[
                      styles.bubbleFooter,
                      { borderTopColor: 'rgba(44, 30, 22, 0.1)' },
                    ]}
                  >
                    <Text
                      style={[styles.bubbleTime, { color: palette.textMocha }]}
                    >
                      {entry.occurredAt}
                    </Text>
                    <Text
                      style={[
                        styles.bubbleRunningBalance,
                        { color: palette.textEspresso },
                      ]}
                    >
                      Balance: {formatINR(entry.runningRemainingPaise)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* 3. Bottom Action Bar: [ 🔴 Gave / Udhaar Diya ] & [ 🟢 Got / Wapas Mila ] */}
      <View
        style={[
          styles.bottomActionContainer,
          {
            backgroundColor: palette.surfaceBeige,
            borderTopColor: palette.borderLatte,
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => {
            setAmountRupees('');
            setEntryModalAction('GAVE');
          }}
          style={[
            styles.actionButton,
            { backgroundColor: palette.giveTerracottaRed },
          ]}
        >
          <Text style={[styles.actionBtnTitle, { color: palette.textOnPrimary }]}>
            🔴 Gave / Udhaar Diya
          </Text>
          <Text style={[styles.actionBtnSub, { color: palette.surfaceBeige }]}>
            Maine Diye (₹)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => {
            setAmountRupees(
              remainingRupeesNumber > 0 ? String(remainingRupeesNumber) : ''
            );
            setEntryModalAction('GOT');
          }}
          style={[
            styles.actionButton,
            { backgroundColor: palette.receiveSageGreen },
          ]}
        >
          <Text style={[styles.actionBtnTitle, { color: palette.textOnPrimary }]}>
            🟢 Got / Wapas Mila
          </Text>
          <Text style={[styles.actionBtnSub, { color: palette.surfaceBeige }]}>
            Mujhe Mile / Settle (₹)
          </Text>
        </TouchableOpacity>
      </View>

      {/* Partial Repayment / Additional Udhaar Modal */}
      <Modal
        visible={entryModalAction !== null}
        transparent
        animationType="slide"
      >
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
              {entryModalAction === 'GOT'
                ? `🟢 Wapas Mila from ${contact.displayName}`
                : `🔴 Udhaar Diya to ${contact.displayName}`}
            </Text>

            <Text style={[styles.modalSub, { color: palette.textMocha }]}>
              Current Remaining Balance: {formatINR(remainingPaise)}
            </Text>

            <Text style={[styles.inputLabel, { color: palette.textEspresso }]}>
              Amount (in ₹ Rupees)
            </Text>
            <TextInput
              value={amountRupees}
              onChangeText={setAmountRupees}
              keyboardType="numeric"
              placeholder="Enter amount"
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
              Payment Mode
            </Text>
            <View style={styles.modeRow}>
              {(['UPI', 'CASH', 'BANK_TRANSFER'] as PaymentChannel[]).map(
                (ch) => (
                  <TouchableOpacity
                    key={ch}
                    onPress={() => setPaymentVia(ch)}
                    style={[
                      styles.modeBtn,
                      {
                        backgroundColor:
                          paymentVia === ch
                            ? palette.primaryBrown
                            : palette.surfaceElevated,
                        borderColor: palette.borderLatte,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color:
                          paymentVia === ch
                            ? palette.textOnPrimary
                            : palette.textEspresso,
                      }}
                    >
                      {ch}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>

            <Text style={[styles.inputLabel, { color: palette.textEspresso }]}>
              Note / Vivaran
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Enter note"
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
                onPress={() => setEntryModalAction(null)}
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
                onPress={handleConfirmEntry}
                disabled={recordEntryMutation.isPending}
                style={[
                  styles.confirmBtn,
                  {
                    backgroundColor:
                      entryModalAction === 'GOT'
                        ? palette.receiveSageGreen
                        : palette.giveTerracottaRed,
                  },
                ]}
              >
                <Text
                  style={{ color: palette.textOnPrimary, fontWeight: '800' }}
                >
                  {recordEntryMutation.isPending
                    ? 'Saving...'
                    : '✅ Confirm & Save'}
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
  },
  backBtn: {
    paddingVertical: 10,
  },
  topBar: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 12,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(250, 246, 240, 0.16)',
  },
  backPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  contactSub: {
    fontSize: 11,
    marginTop: 2,
  },
  waHeaderBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  waHeaderBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  mathSummaryCard: {
    flexDirection: 'row',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mathCol: {
    flex: 1,
    alignItems: 'center',
  },
  mathColLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  mathColVal: {
    fontSize: 14,
    fontWeight: '900',
    marginTop: 2,
  },
  verticalDivider: {
    width: 1,
    height: 28,
  },
  chatScroll: {
    padding: 14,
    paddingBottom: 110,
    gap: 12,
  },
  EncryptedNotice: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'center',
    marginBottom: 4,
  },
  encryptedText: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  bubbleWrapper: {
    width: '100%',
    flexDirection: 'row',
  },
  alignLeft: {
    justifyContent: 'flex-start',
  },
  alignRight: {
    justifyContent: 'flex-end',
  },
  chatBubble: {
    width: '82%',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
  },
  bubbleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bubbleDirectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  bubbleViaBadge: {
    fontSize: 10,
    fontWeight: '700',
  },
  bubbleAmount: {
    fontSize: 21,
    fontWeight: '900',
    marginVertical: 4,
  },
  bubbleNote: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  bubbleFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
  },
  bubbleTime: {
    fontSize: 10,
    fontWeight: '600',
  },
  bubbleRunningBalance: {
    fontSize: 11,
    fontWeight: '800',
  },
  bottomActionContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionBtnTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  actionBtnSub: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: '600',
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
    fontSize: 17,
    fontWeight: '800',
  },
  modalSub: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 12,
    fontWeight: '600',
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
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
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
  confirmBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
});
