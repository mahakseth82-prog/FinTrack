import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFinTrackTheme } from '../context/ThemeContext';
import { useDeleteTransaction, useUpdateTransaction } from '../hooks/useFinTrackQueries';
import { TransactionDto, PaymentChannel } from '../types/ledger';
import { formatINR, paiseToRupees } from '../utils/paise';
import { SYSTEM_FONT_STACK } from '../theme/colors';

interface TransactionDetailModalProps {
  visible: boolean;
  transaction: TransactionDto | null;
  onClose: () => void;
  workspaceId?: string | null;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  visible,
  transaction,
  onClose,
  workspaceId: propWorkspaceId,
}) => {
  const { palette, activeWorkspaceId } = useFinTrackTheme();
  const effectiveWorkspaceId = propWorkspaceId ?? activeWorkspaceId;
  const deleteMutation = useDeleteTransaction(effectiveWorkspaceId);
  const updateMutation = useUpdateTransaction(effectiveWorkspaceId);

  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Edit form state
  const [editMerchant, setEditMerchant] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editNote, setEditNote] = useState('');

  // Sync state when transaction changes or modal opens
  React.useEffect(() => {
    if (transaction) {
      setEditMerchant(transaction.merchantOrPayee);
      setEditAmount(String(paiseToRupees(transaction.amountPaise)));
      setEditCategory(transaction.categoryName);
      setEditNote(transaction.description || '');
      setIsEditing(false);
      setShowDeleteConfirm(false);
    }
  }, [transaction, visible]);

  if (!transaction) return null;

  const isIncome = transaction.kind === 'INCOME';
  const sign = isIncome ? '+' : '-';
  const amountFormatted = `${sign}${formatINR(transaction.amountPaise)}`;

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(transaction.id);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not delete transaction';
      Alert.alert('Error', msg);
    }
  };

  const handleSaveEdit = async () => {
    const num = parseFloat(editAmount);
    if (isNaN(num) || num <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid rupee amount.');
      return;
    }

    try {
      await updateMutation.mutateAsync({
        transactionId: transaction.id,
        merchantOrPayee: editMerchant.trim() || transaction.merchantOrPayee,
        amountRupees: num,
        categoryName: editCategory.trim() || transaction.categoryName,
        description: editNote.trim(),
      });
      setIsEditing(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not update transaction';
      Alert.alert('Error', msg);
    }
  };

  const formattedDate = new Date(transaction.occurredAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const formattedTime = new Date(transaction.occurredAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.titleInfo}>
              <View style={[styles.iconCircle, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="receipt-outline" size={20} color="#059669" />
              </View>
              <View>
                <Text style={styles.modalHeading}>{isEditing ? 'Edit Transaction' : 'Transaction Details'}</Text>
                <Text style={styles.dateSubtext}>
                  {formattedDate} • {formattedTime}
                </Text>
              </View>
            </View>

            <TouchableOpacity activeOpacity={0.8} onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Amount Display */}
          {!isEditing && (
            <View style={styles.amountHero}>
              <Text
                style={[
                  styles.amountHeroText,
                  { color: isIncome ? '#059669' : '#0F172A' },
                ]}
              >
                {amountFormatted}
              </Text>
              <Text style={styles.merchantHeroName}>{transaction.merchantOrPayee}</Text>
            </View>
          )}

          {/* Details or Edit Form */}
          {!isEditing ? (
            <View style={styles.detailsList}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Category</Text>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>{transaction.categoryName}</Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Payment Method</Text>
                <Text style={styles.detailValue}>{transaction.paymentVia || 'UPI'}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Source</Text>
                <Text style={styles.detailValue}>{transaction.sourceType || 'VOICE / MANUAL'}</Text>
              </View>

              {transaction.description && transaction.description !== transaction.merchantOrPayee ? (
                <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.detailLabel}>Note</Text>
                  <Text style={[styles.detailValue, { flex: 1, textAlign: 'right' }]}>
                    {transaction.description}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.editForm}>
              <Text style={styles.inputLabel}>Title / Merchant</Text>
              <TextInput
                value={editMerchant}
                onChangeText={setEditMerchant}
                placeholder="e.g. Clothes Purchase"
                placeholderTextColor="#94A3B8"
                style={styles.textInput}
              />

              <Text style={styles.inputLabel}>Amount (₹)</Text>
              <TextInput
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="numeric"
                placeholder="e.g. 1200"
                placeholderTextColor="#94A3B8"
                style={styles.textInput}
              />

              <Text style={styles.inputLabel}>Category</Text>
              <TextInput
                value={editCategory}
                onChangeText={setEditCategory}
                placeholder="e.g. Grocery & Rashan"
                placeholderTextColor="#94A3B8"
                style={styles.textInput}
              />

              <Text style={styles.inputLabel}>Note (Optional)</Text>
              <TextInput
                value={editNote}
                onChangeText={setEditNote}
                placeholder="Additional notes"
                placeholderTextColor="#94A3B8"
                style={styles.textInput}
              />
            </View>
          )}

          {/* Delete Confirmation Box */}
          {showDeleteConfirm && (
            <View style={styles.deleteConfirmBox}>
              <Text style={styles.deleteConfirmTitle}>Delete this transaction?</Text>
              <Text style={styles.deleteConfirmBody}>
                This will permanently delete this {isIncome ? 'income' : 'expense'} of {amountFormatted} and recalculate your budget immediately.
              </Text>
              <View style={styles.confirmButtonsRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setShowDeleteConfirm(false)}
                  style={styles.cancelConfirmBtn}
                >
                  <Text style={styles.cancelConfirmText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={deleteMutation.isPending}
                  onPress={handleDelete}
                  style={styles.deleteConfirmBtn}
                >
                  {deleteMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.deleteConfirmBtnText}>Delete</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Bottom Actions */}
          {!showDeleteConfirm && (
            <View style={styles.actionsFooter}>
              {isEditing ? (
                <View style={styles.editActionsRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setIsEditing(false)}
                    style={styles.cancelEditBtn}
                  >
                    <Text style={styles.cancelEditText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={updateMutation.isPending}
                    onPress={handleSaveEdit}
                    style={[styles.saveEditBtn, { backgroundColor: palette.primaryBrown }]}
                  >
                    {updateMutation.isPending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveEditText}>Save Changes</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.defaultActionsRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setShowDeleteConfirm(true)}
                    style={styles.deleteActionBtn}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    <Text style={styles.deleteActionText}>Delete</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setIsEditing(true)}
                    style={[styles.editActionBtn, { borderColor: '#059669' }]}
                  >
                    <Ionicons name="pencil-outline" size={16} color="#059669" />
                    <Text style={[styles.editActionText, { color: '#059669' }]}>Edit</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
  },
  dateSubtext: {
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
  amountHero: {
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    marginBottom: 16,
  },
  amountHeroText: {
    fontSize: 30,
    fontWeight: '800',
    fontFamily: SYSTEM_FONT_STACK,
    letterSpacing: -0.5,
  },
  merchantHeroName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginTop: 4,
  },
  detailsList: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 18,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  categoryBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  editForm: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
    marginTop: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  deleteConfirmBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  deleteConfirmTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 4,
  },
  deleteConfirmBody: {
    fontSize: 12,
    color: '#B91C1C',
    lineHeight: 16,
    marginBottom: 12,
  },
  confirmButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelConfirmBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  cancelConfirmText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  deleteConfirmBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionsFooter: {
    marginTop: 6,
  },
  defaultActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  deleteActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  deleteActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },
  editActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
  },
  editActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelEditBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelEditText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  saveEditBtn: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveEditText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

