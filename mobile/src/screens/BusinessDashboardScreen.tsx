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
  useLedger,
  ContactLedgerItem,
  ObligationDirection,
  ContactKind,
} from '../context/LedgerContext';
import { formatINR } from '../utils/paise';

type FilterChip = 'ALL' | 'OVERDUE' | 'DUE_TODAY' | 'CUSTOMERS' | 'SUPPLIERS';

interface BusinessDashboardProps {
  onOpenContactDetail: (contact: ContactLedgerItem) => void;
}

export const BusinessDashboardScreen: React.FC<BusinessDashboardProps> = ({
  onOpenContactDetail,
}) => {
  const { palette } = useFinTrackTheme();
  const { getWorkspaceContacts, addNewContactObligation } = useLedger();

  const [activeFilter, setActiveFilter] = useState<FilterChip>('ALL');
  const [showNewUdhaarModal, setShowNewUdhaarModal] = useState(false);
  const [contactName, setContactName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [direction, setDirection] = useState<ObligationDirection>('RECEIVABLE');
  const [principalRupees, setPrincipalRupees] = useState('');
  const [dueDate, setDueDate] = useState('2026-11-10');
  const [note, setNote] = useState('');

  const businessContacts = getWorkspaceContacts('BUSINESS');

  // Integer Paise Totals for Business Udhaar Khata
  const totalWillGetPaise = businessContacts
    .filter((c) => c.direction === 'RECEIVABLE' && c.status !== 'SETTLED')
    .reduce((sum, c) => sum + c.remainingPaise, 0);

  const totalWillGivePaise = businessContacts
    .filter((c) => c.direction === 'PAYABLE' && c.status !== 'SETTLED')
    .reduce((sum, c) => sum + c.remainingPaise, 0);

  const filteredContacts = businessContacts.filter((c) => {
    if (activeFilter === 'OVERDUE') return c.dueTag === 'OVERDUE';
    if (activeFilter === 'DUE_TODAY') return c.dueTag === 'DUE_TODAY';
    if (activeFilter === 'CUSTOMERS') return c.kind === 'CUSTOMER';
    if (activeFilter === 'SUPPLIERS') return c.kind === 'SUPPLIER';
    return true;
  });

  const handleDirectWhatsAppRemind = async (contact: ContactLedgerItem) => {
    const cleanPhone = contact.phoneNumber.replace(/[^\d+]/g, '');
    const amountStr = formatINR(contact.remainingPaise);
    const politeMsg = `Namaste ${contact.displayName} ji 🙏, FinTrack Vyapaar Khata par aapka ${amountStr} ka balance (${contact.titleOrNote}) due hai. Jab suvidha ho toh UPI ya cash se bhej dijiyega. Dhanyawad!`;
    const url = `https://wa.me/${cleanPhone.replace('+', '')}?text=${encodeURIComponent(politeMsg)}`;
    try {
      await Linking.openURL(url);
    } catch {
      // Fallback if WhatsApp is not installed in simulator
    }
  };

  const handleCreateUdhaar = () => {
    if (!contactName.trim() || !principalRupees.trim()) return;
    const kind: ContactKind =
      direction === 'RECEIVABLE' ? 'CUSTOMER' : 'SUPPLIER';
    const created = addNewContactObligation({
      workspaceMode: 'BUSINESS',
      displayName: contactName.trim(),
      phoneNumber: phoneNumber.trim() || '+919876543210',
      kind,
      direction,
      principalRupees: principalRupees.trim(),
      dueDate: dueDate.trim() || '2026-11-10',
      titleOrNote: note.trim() || 'Dukaan Udhaar Entry',
    });
    setContactName('');
    setPhoneNumber('');
    setPrincipalRupees('');
    setNote('');
    setShowNewUdhaarModal(false);
    onOpenContactDetail(created);
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
            <Text style={[styles.addCustomerBtnText, { color: palette.textOnPrimary }]}>
              + Naya Udhaar
            </Text>
          </TouchableOpacity>
        </View>

        {/* Top Summary Cards: You Will Get vs You Will Give */}
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
              {formatINR(totalWillGetPaise)}
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
              {formatINR(totalWillGivePaise)}
            </Text>
            <Text style={[styles.summaryBoxSub, { color: palette.textMocha }]}>
              Suppliers / Wholesalers Baki
            </Text>
          </View>
        </View>
      </View>

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

      {/* 3. Customer & Supplier Ledger List */}
      <View style={styles.listContainer}>
        {filteredContacts.map((contact) => {
          const isReceivable = contact.direction === 'RECEIVABLE';
          const badgeColor =
            contact.dueTag === 'OVERDUE'
              ? palette.giveTerracottaRed
              : contact.dueTag === 'DUE_TODAY'
                ? palette.warningAmber
                : palette.primaryBrown;

          return (
            <TouchableOpacity
              key={contact.id}
              activeOpacity={0.9}
              onPress={() => onOpenContactDetail(contact)}
              style={[
                styles.customerCard,
                {
                  backgroundColor: palette.surfaceBeige,
                  borderColor: palette.borderLatte,
                },
              ]}
            >
              {/* Top Row: Name + Remaining Balance */}
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
                      style={[styles.customerNote, { color: palette.textMocha }]}
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

              {/* Middle Row: Partial Payment Breakdown Pill */}
              <View
                style={[
                  styles.breakdownBar,
                  {
                    backgroundColor: palette.surfaceElevated,
                    borderColor: palette.borderLatte,
                  },
                ]}
              >
                <Text style={[styles.breakdownText, { color: palette.textMocha }]}>
                  Original:{' '}
                  <Text style={{ fontWeight: '700', color: palette.textEspresso }}>
                    {formatINR(contact.principalPaise)}
                  </Text>
                </Text>
                <Text style={[styles.breakdownText, { color: palette.textMocha }]}>
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
                <Text style={[styles.breakdownText, { color: palette.textMocha }]}>
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

              {/* Footer Row: Due Date Status + Direct WhatsApp [ 💬 Remind ] Button */}
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
        })}
      </View>

      {/* Modal: Add New Customer / Supplier Udhaar */}
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
              Customer / Supplier Ka Naam
            </Text>
            <TextInput
              value={contactName}
              onChangeText={setContactName}
              placeholder="e.g. राजेश किराना / Rajesh Store"
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
              placeholder="e.g. 2000"
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
              Due Date (YYYY-MM-DD) & Samaan Note
            </Text>
            <TextInput
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="2026-11-10"
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
              placeholder="e.g. 2 Bori Chini & Oil Carton"
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
