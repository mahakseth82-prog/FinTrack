import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFinTrackTheme } from '../context/ThemeContext';
import { useCreateTransaction } from '../hooks/useFinTrackQueries';
import { TransactionKind, PaymentChannel } from '../types/ledger';
import { SYSTEM_FONT_STACK, EMERALD_THEME } from '../theme/colors';

interface ManualTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  initialValues?: {
    amountRupees?: number;
    merchantOrPayee?: string;
    categoryName?: string;
    kind?: TransactionKind;
    paymentVia?: PaymentChannel;
    description?: string;
    receiptImagePath?: string | null;
    receiptImageUrl?: string | null;
  };
}

const EXPENSE_CATEGORIES = [
  'Chai & Dining',
  'Grocery & Rashan',
  'Petrol & Travel',
  'Shopping',
  'Bills & Utilities',
  'Personal Udhaar',
  'Miscellaneous',
];

const INCOME_CATEGORIES = [
  'Salary',
  'Business Sale',
  'Client Payment',
  'Udhaar Received',
  'Investment / Cashback',
  'Other',
];

const PAYMENT_MODES: { label: string; value: PaymentChannel }[] = [
  { label: 'UPI', value: 'UPI' },
  { label: 'Cash', value: 'CASH' },
  { label: 'Card', value: 'CARD' },
  { label: 'Bank', value: 'BANK_TRANSFER' },
  { label: 'Not Specified', value: 'UNSPECIFIED' },
];

export const ManualTransactionModal: React.FC<ManualTransactionModalProps> = ({
  visible,
  onClose,
  initialValues,
}) => {
  const { activeWorkspaceId } = useFinTrackTheme();
  const createTxMutation = useCreateTransaction(activeWorkspaceId);

  const [kind, setKind] = useState<TransactionKind>('EXPENSE');
  const [amountStr, setAmountStr] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('Chai & Dining');
  const [paymentVia, setPaymentVia] = useState<PaymentChannel>('UPI');
  const [description, setDescription] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setKind(initialValues?.kind || 'EXPENSE');
      setAmountStr(initialValues?.amountRupees ? String(initialValues.amountRupees) : '');
      setMerchant(initialValues?.merchantOrPayee || '');
      setCategory(
        initialValues?.categoryName ||
          (initialValues?.kind === 'INCOME' ? 'Salary' : 'Chai & Dining')
      );
      setPaymentVia(initialValues?.paymentVia || 'UPI');
      setDescription(initialValues?.description || '');
      setErrorMessage(null);
    }
  }, [visible, initialValues]);

  const handleKindChange = (newKind: TransactionKind) => {
    setKind(newKind);
    if (newKind === 'INCOME') {
      setCategory('Salary');
    } else {
      setCategory('Chai & Dining');
    }
  };

  const handleSave = async () => {
    setErrorMessage(null);
    const parsedAmount = parseFloat(amountStr.replace(/[^0-9.]/g, ''));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage('Please enter a valid amount greater than 0.');
      return;
    }

    const trimmedMerchant = merchant.trim() || (kind === 'EXPENSE' ? category : 'Income');

    try {
      await createTxMutation.mutateAsync({
        kind,
        categoryName: category,
        merchantOrPayee: trimmedMerchant,
        description: description.trim() || '',
        amountRupees: parsedAmount,
        paymentVia,
        receiptImagePath: initialValues?.receiptImagePath || null,
        receiptImageUrl: initialValues?.receiptImageUrl || null,
      });

      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save transaction';
      setErrorMessage(msg);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.modalTitle}>New Transaction</Text>
              <Text style={styles.modalSubtitle}>Manual entry into passbook</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Kind Selector: Expense / Income */}
            <View style={styles.kindTrack}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleKindChange('EXPENSE')}
                style={[
                  styles.kindBtn,
                  kind === 'EXPENSE' && { backgroundColor: '#EF4444' },
                ]}
              >
                <Text
                  style={[
                    styles.kindBtnText,
                    kind === 'EXPENSE' && { color: '#FFFFFF', fontWeight: '800' },
                  ]}
                >
                  Expense (खर्च)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleKindChange('INCOME')}
                style={[
                  styles.kindBtn,
                  kind === 'INCOME' && { backgroundColor: EMERALD_THEME.emeraldGreen },
                ]}
              >
                <Text
                  style={[
                    styles.kindBtnText,
                    kind === 'INCOME' && { color: '#FFFFFF', fontWeight: '800' },
                  ]}
                >
                  Income (आमदनी)
                </Text>
              </TouchableOpacity>
            </View>

            {/* Attached Receipt Notice if populated from Bill Scanner */}
            {Boolean(initialValues?.receiptImageUrl || initialValues?.receiptImagePath) && (
              <View style={styles.attachedReceiptBadge}>
                <Ionicons name="attach-outline" size={16} color="#0284C7" />
                <Text style={styles.attachedReceiptText}>Scanned Bill / Receipt Image Attached</Text>
              </View>
            )}

            {/* Hero Amount Field */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Amount (रुपये)</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.rupeePrefix}>₹</Text>
                <TextInput
                  value={amountStr}
                  onChangeText={setAmountStr}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                  style={styles.amountInput}
                  autoFocus
                />
              </View>
            </View>

            {/* Merchant / Description */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>
                {kind === 'EXPENSE' ? 'Spent on / Merchant' : 'Received from / Source'}
              </Text>
              <TextInput
                value={merchant}
                onChangeText={setMerchant}
                placeholder={
                  kind === 'EXPENSE'
                    ? 'e.g. Swiggy, Petrol, Dmart, Ravi'
                    : 'e.g. Salary, Client payment'
                }
                placeholderTextColor="#94A3B8"
                style={styles.textInput}
              />
            </View>

            {/* Category Selector Chips */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.chipsWrap}>
                {(kind === 'EXPENSE' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((cat) => {
                  const isSelected = category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      activeOpacity={0.8}
                      onPress={() => setCategory(cat)}
                      style={[
                        styles.categoryChip,
                        isSelected && {
                          backgroundColor: EMERALD_THEME.emeraldGreen,
                          borderColor: EMERALD_THEME.emeraldGreen,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          isSelected && { color: '#FFFFFF', fontWeight: '700' },
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Payment Method */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Payment Via</Text>
              <View style={styles.paymentRow}>
                {PAYMENT_MODES.map((pm) => {
                  const isSelected = paymentVia === pm.value;
                  return (
                    <TouchableOpacity
                      key={pm.value}
                      activeOpacity={0.8}
                      onPress={() => setPaymentVia(pm.value)}
                      style={[
                        styles.paymentChip,
                        isSelected && {
                          backgroundColor: '#0F172A',
                          borderColor: '#0F172A',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.paymentChipText,
                          isSelected && { color: '#FFFFFF', fontWeight: '700' },
                        ]}
                      >
                        {pm.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Optional Note */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Note / Description (Optional)</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Add additional remarks or bill number..."
                placeholderTextColor="#94A3B8"
                style={styles.textInput}
              />
            </View>

            {errorMessage ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Save Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleSave}
              disabled={createTxMutation.isPending}
              style={[
                styles.saveBtn,
                {
                  backgroundColor:
                    kind === 'INCOME' ? EMERALD_THEME.emeraldGreen : '#0F172A',
                },
              ]}
            >
              {createTxMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save Entry</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  kindTrack: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  kindBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  fieldBlock: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rupeePrefix: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    marginRight: 6,
    fontFamily: SYSTEM_FONT_STACK,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
    padding: 0,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  paymentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  paymentChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  paymentChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
    flex: 1,
  },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  attachedReceiptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  attachedReceiptText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0369A1',
  },
});
