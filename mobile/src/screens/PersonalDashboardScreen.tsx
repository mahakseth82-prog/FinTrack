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
  useLedger,
  ContactLedgerItem,
  TransactionKind,
} from '../context/LedgerContext';
import { formatINR } from '../utils/paise';

interface PersonalDashboardProps {
  onOpenContactDetail: (contact: ContactLedgerItem) => void;
  onOpenDraftsTab: () => void;
}

export const PersonalDashboardScreen: React.FC<PersonalDashboardProps> = ({
  onOpenContactDetail,
  onOpenDraftsTab,
}) => {
  const { palette } = useFinTrackTheme();
  const {
    getWorkspaceTransactions,
    getWorkspaceBudgets,
    getWorkspaceContacts,
    detectedUpiCount,
    addTransaction,
  } = useLedger();

  const [showAddModal, setShowAddModal] = useState(false);
  const [txKind, setTxKind] = useState<TransactionKind>('EXPENSE');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('Grocery & Rashan');
  const [amountRupees, setAmountRupees] = useState('');
  const [description, setDescription] = useState('');

  const personalTxs = getWorkspaceTransactions('PERSONAL');
  const personalBudgets = getWorkspaceBudgets('PERSONAL');
  const personalContacts = getWorkspaceContacts('PERSONAL');

  // Integer Paise Aggregations (Rule #2)
  const totalSpentPaise = personalTxs
    .filter((t) => t.kind === 'EXPENSE')
    .reduce((sum, t) => sum + t.amountPaise, 0);

  const totalIncomePaise = personalTxs
    .filter((t) => t.kind === 'INCOME')
    .reduce((sum, t) => sum + t.amountPaise, 0);

  const personalWillGetPaise = personalContacts
    .filter((c) => c.direction === 'RECEIVABLE' && c.status !== 'SETTLED')
    .reduce((sum, c) => sum + c.remainingPaise, 0);

  const personalYouOwePaise = personalContacts
    .filter((c) => c.direction === 'PAYABLE' && c.status !== 'SETTLED')
    .reduce((sum, c) => sum + c.remainingPaise, 0);

  const handleSaveTransaction = () => {
    if (!amountRupees.trim() || Number(amountRupees) <= 0) return;
    addTransaction({
      workspaceMode: 'PERSONAL',
      kind: txKind,
      categoryName: category,
      merchantOrPayee: merchant.trim() || category,
      description: description.trim() || 'Manual Entry',
      amountRupees: amountRupees.trim(),
      paymentVia: 'UPI',
    });
    setAmountRupees('');
    setMerchant('');
    setDescription('');
    setShowAddModal(false);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Monthly Spent vs Income Card (Warm Coffee Brown #6F4E37) */}
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: palette.primaryBrown },
        ]}
      >
        <View style={styles.summaryHeaderRow}>
          <Text style={[styles.summaryMonthText, { color: palette.accentWarm }]}>
            OCTOBER 2026 • GHAR KA HISAB
          </Text>
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            style={[
              styles.quickAddBtn,
              { backgroundColor: palette.accentWarm },
            ]}
          >
            <Text style={[styles.quickAddBtnText, { color: palette.textEspresso }]}>
              + Add Entry
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryMetricsRow}>
          <View style={styles.metricBlock}>
            <Text style={[styles.metricLabel, { color: palette.surfaceBeige }]}>
              Total Spent (Kharcha)
            </Text>
            <Text style={[styles.metricValue, { color: palette.textOnPrimary }]}>
              {formatINR(totalSpentPaise)}
            </Text>
          </View>

          <View
            style={[
              styles.metricDivider,
              { backgroundColor: 'rgba(250, 246, 240, 0.22)' },
            ]}
          />

          <View style={styles.metricBlock}>
            <Text style={[styles.metricLabel, { color: palette.surfaceBeige }]}>
              Total Income (Kamaai)
            </Text>
            <Text style={[styles.metricValue, { color: '#C6F6D5' }]}>
              {formatINR(totalIncomePaise)}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.savingsFooter,
            { borderTopColor: 'rgba(250, 246, 240, 0.18)' },
          ]}
        >
          <Text style={[styles.savingsText, { color: palette.surfaceBeige }]}>
            Bachat (Net Balance):{' '}
            <Text style={{ fontWeight: '800', color: palette.textOnPrimary }}>
              {formatINR(totalIncomePaise - totalSpentPaise)}
            </Text>
          </Text>
        </View>
      </View>

      {/* 2. UPI Payments Detected Banner */}
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={onOpenDraftsTab}
        style={[
          styles.upiBanner,
          {
            backgroundColor: palette.warningAmberTint,
            borderColor: palette.accentWarm,
          },
        ]}
      >
        <View style={styles.upiBannerLeft}>
          <Text style={styles.upiBellIcon}>🔔</Text>
          <View>
            <Text style={[styles.upiBannerTitle, { color: palette.textEspresso }]}>
              {detectedUpiCount} UPI Payments Detected
            </Text>
            <Text style={[styles.upiBannerSub, { color: palette.textMocha }]}>
              GPay & PhonePe notifications ready — Tap to review & confirm
            </Text>
          </View>
        </View>
        <Text style={[styles.upiArrow, { color: palette.primaryBrown }]}>→</Text>
      </TouchableOpacity>

      {/* 3. Personal Udhaar Mini-Card (You Will Get / You Owe) */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: palette.surfaceBeige,
            borderColor: palette.borderLatte,
          },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: palette.textEspresso }]}>
          🤝 Personal & Friends Udhaar
        </Text>

        <View style={styles.udhaarSplitRow}>
          <View
            style={[
              styles.udhaarMiniBox,
              {
                backgroundColor: palette.receiveSageTint,
                borderColor: palette.receiveSageGreen,
              },
            ]}
          >
            <Text
              style={[
                styles.udhaarMiniLabel,
                { color: palette.receiveSageGreen },
              ]}
            >
              You Will Get (Lena Hai)
            </Text>
            <Text
              style={[
                styles.udhaarMiniAmount,
                { color: palette.receiveSageGreen },
              ]}
            >
              {formatINR(personalWillGetPaise)}
            </Text>
          </View>

          <View
            style={[
              styles.udhaarMiniBox,
              {
                backgroundColor: palette.giveTerracottaTint,
                borderColor: palette.giveTerracottaRed,
              },
            ]}
          >
            <Text
              style={[
                styles.udhaarMiniLabel,
                { color: palette.giveTerracottaRed },
              ]}
            >
              You Owe (Dena Hai)
            </Text>
            <Text
              style={[
                styles.udhaarMiniAmount,
                { color: palette.giveTerracottaRed },
              ]}
            >
              {formatINR(personalYouOwePaise)}
            </Text>
          </View>
        </View>

        {personalContacts.map((friend) => (
          <TouchableOpacity
            key={friend.id}
            onPress={() => onOpenContactDetail(friend)}
            style={[
              styles.friendRow,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.borderLatte,
              },
            ]}
          >
            <View>
              <Text style={[styles.friendName, { color: palette.textEspresso }]}>
                {friend.displayName}
              </Text>
              <Text style={[styles.friendNote, { color: palette.textMocha }]}>
                {friend.titleOrNote} • Due: {friend.dueDate}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text
                style={[
                  styles.friendAmount,
                  {
                    color:
                      friend.direction === 'RECEIVABLE'
                        ? palette.receiveSageGreen
                        : palette.giveTerracottaRed,
                  },
                ]}
              >
                {friend.direction === 'RECEIVABLE' ? '+' : '-'}
                {formatINR(friend.remainingPaise)}
              </Text>
              <Text style={[styles.tapChatHint, { color: palette.primaryBrown }]}>
                Open Chat Timeline →
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* 4. Monthly Category Budgets (With 80%+ Alert Bar) */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: palette.surfaceBeige,
            borderColor: palette.borderLatte,
          },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: palette.textEspresso }]}>
          📊 Monthly Category Budgets
        </Text>

        {personalBudgets.map((b) => {
          const pct = Math.min(
            100,
            Math.round((b.spentPaise / b.limitPaise) * 100)
          );
          const isOverThreshold = pct >= b.alertThresholdPercent;
          const barColor = isOverThreshold
            ? palette.giveTerracottaRed
            : palette.primaryBrown;

          return (
            <View key={b.id} style={styles.budgetItem}>
              <View style={styles.budgetHeaderRow}>
                <Text style={[styles.budgetName, { color: palette.textEspresso }]}>
                  {b.icon} {b.categoryName}
                </Text>
                <Text
                  style={[
                    styles.budgetNumbers,
                    {
                      color: isOverThreshold
                        ? palette.giveTerracottaRed
                        : palette.textMocha,
                    },
                  ]}
                >
                  {formatINR(b.spentPaise)} / {formatINR(b.limitPaise)} ({pct}%)
                </Text>
              </View>

              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: palette.pillInactiveBg },
                ]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${pct}%`,
                      backgroundColor: barColor,
                    },
                  ]}
                />
              </View>

              {isOverThreshold && (
                <Text
                  style={[
                    styles.budgetAlertText,
                    { color: palette.giveTerracottaRed },
                  ]}
                >
                  ⚠️ Alert: {pct}% budget used (Crossed {b.alertThresholdPercent}% limit)
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {/* 5. Recent Transactions List */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: palette.surfaceBeige,
            borderColor: palette.borderLatte,
          },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: palette.textEspresso }]}>
          🧾 Recent Transactions
        </Text>

        {personalTxs.map((tx) => (
          <View
            key={tx.id}
            style={[
              styles.txRow,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.borderLatte,
              },
            ]}
          >
            <View style={styles.txLeft}>
              <View
                style={[
                  styles.txIconBox,
                  { backgroundColor: palette.surfaceBeige },
                ]}
              >
                <Text style={styles.txEmoji}>{tx.categoryIcon}</Text>
              </View>
              <View>
                <Text style={[styles.txMerchant, { color: palette.textEspresso }]}>
                  {tx.merchantOrPayee}
                </Text>
                <Text style={[styles.txMeta, { color: palette.textMocha }]}>
                  {tx.categoryName} • {tx.paymentVia} • {tx.occurredAt}
                </Text>
              </View>
            </View>

            <Text
              style={[
                styles.txAmount,
                {
                  color:
                    tx.kind === 'INCOME'
                      ? palette.receiveSageGreen
                      : palette.giveTerracottaRed,
                },
              ]}
            >
              {tx.kind === 'INCOME' ? '+' : '-'}
              {formatINR(tx.amountPaise)}
            </Text>
          </View>
        ))}
      </View>

      {/* Quick Add Personal Expense / Income Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
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
              Add Personal Entry
            </Text>

            <View style={styles.kindToggleRow}>
              {(['EXPENSE', 'INCOME'] as TransactionKind[]).map((k) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setTxKind(k)}
                  style={[
                    styles.kindBtn,
                    {
                      backgroundColor:
                        txKind === k
                          ? palette.primaryBrown
                          : palette.surfaceElevated,
                      borderColor: palette.borderLatte,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontWeight: '700',
                      fontSize: 13,
                      color:
                        txKind === k
                          ? palette.textOnPrimary
                          : palette.textEspresso,
                    }}
                  >
                    {k === 'EXPENSE' ? '💸 Kharcha (Expense)' : '💰 Kamaai (Income)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: palette.textEspresso }]}>
              Amount (in ₹ Rupees)
            </Text>
            <TextInput
              value={amountRupees}
              onChangeText={setAmountRupees}
              placeholder="e.g. 450"
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
              Merchant / Kahan Kharch Hua
            </Text>
            <TextInput
              value={merchant}
              onChangeText={setMerchant}
              placeholder="e.g. Mother Dairy / BigBasket"
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
              Category
            </Text>
            <View style={styles.catChipRow}>
              {['Grocery & Rashan', 'Petrol & Travel', 'Chai & Dining'].map(
                (cat) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={[
                      styles.catChip,
                      {
                        backgroundColor:
                          category === cat
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
                          category === cat
                            ? palette.textOnPrimary
                            : palette.textEspresso,
                      }}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
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
                onPress={handleSaveTransaction}
                style={[
                  styles.saveBtn,
                  { backgroundColor: palette.primaryBrown },
                ]}
              >
                <Text
                  style={{ color: palette.textOnPrimary, fontWeight: '800' }}
                >
                  ✅ Confirm & Save
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 110,
    gap: 14,
  },
  summaryCard: {
    borderRadius: 18,
    padding: 18,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  summaryMonthText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  quickAddBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  quickAddBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  summaryMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricBlock: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 23,
    fontWeight: '800',
  },
  metricDivider: {
    width: 1,
    height: 40,
    marginHorizontal: 14,
  },
  savingsFooter: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  savingsText: {
    fontSize: 12,
  },
  upiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  upiBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  upiBellIcon: {
    fontSize: 22,
  },
  upiBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  upiBannerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  upiArrow: {
    fontSize: 18,
    fontWeight: '800',
  },
  sectionCard: {
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  udhaarSplitRow: {
    flexDirection: 'row',
    gap: 10,
  },
  udhaarMiniBox: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  udhaarMiniLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  udhaarMiniAmount: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  friendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  friendName: {
    fontSize: 13,
    fontWeight: '700',
  },
  friendNote: {
    fontSize: 11,
    marginTop: 2,
  },
  friendAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  tapChatHint: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  budgetItem: {
    marginTop: 4,
  },
  budgetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  budgetName: {
    fontSize: 13,
    fontWeight: '700',
  },
  budgetNumbers: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 9,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  budgetAlertText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  txIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txEmoji: {
    fontSize: 18,
  },
  txMerchant: {
    fontSize: 13,
    fontWeight: '700',
  },
  txMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 14,
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
  kindToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  kindBtn: {
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
  catChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
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
