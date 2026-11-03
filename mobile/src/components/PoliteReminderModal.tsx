import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Linking,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFinTrackTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useLogReminderSent } from '../hooks/useFinTrackQueries';
import { formatINR } from '../utils/paise';

export interface ReminderTargetInfo {
  obligationId: string;
  contactId: string;
  contactName: string;
  phoneNumber: string;
  remainingPaise: number;
  dueDate: string;
}

interface PoliteReminderModalProps {
  visible: boolean;
  target: ReminderTargetInfo | null;
  onClose: () => void;
}

export const PoliteReminderModal: React.FC<PoliteReminderModalProps> = ({
  visible,
  target,
  onClose,
}) => {
  const { palette, activeWorkspaceId } = useFinTrackTheme();
  const { user } = useAuth();
  const logSentMutation = useLogReminderSent(activeWorkspaceId);

  const [composedText, setComposedText] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Auto-compose polite, respectful reminder in English whenever target changes
  useEffect(() => {
    if (!visible || !target) return;

    const amountFormatted = formatINR(target.remainingPaise, true);
    const merchantName = user?.fullName || 'FinTrack';
    const dueClause = target.dueDate ? ` (Due date: ${target.dueDate})` : '';

    const message =
      `Hello ${target.contactName} 🙏,\n\n` +
      `Hope you are doing well! This is a gentle reminder regarding your pending balance of ${amountFormatted} on FinTrack${dueClause}.\n\n` +
      `Whenever convenient, kindly arrange to settle the balance at your earliest convenience.\n\n` +
      `Thank you so much for your support! 🤝\n` +
      `— ${merchantName}`;

    setComposedText(message);
    setIsEditing(false);
  }, [visible, target, user?.fullName]);

  if (!target) return null;

  const handleSendViaChannel = async (channel: 'WHATSAPP' | 'SMS') => {
    // Record reminder in ledger audit logs
    try {
      await logSentMutation.mutateAsync({
        obligationId: target.obligationId,
        contactId: target.contactId,
        channel,
        language: 'ENGLISH',
        composedMessage: composedText,
      });
    } catch {
      // Continue opening WhatsApp/SMS even if logging is offline
    }

    const encodedMsg = encodeURIComponent(composedText);

    if (channel === 'WHATSAPP') {
      // Directs to WhatsApp without phone number so user can pick the contact by whatever name they saved them
      const whatsappDeepLink = `whatsapp://send?text=${encodedMsg}`;
      const whatsappWebLink = `https://api.whatsapp.com/send?text=${encodedMsg}`;

      try {
        const canOpenDeep = await Linking.canOpenURL(whatsappDeepLink).catch(() => false);
        if (canOpenDeep) {
          await Linking.openURL(whatsappDeepLink);
        } else {
          await Linking.openURL(whatsappWebLink);
        }
      } catch {
        try {
          await Share.share({
            message: composedText,
            title: `FinTrack Reminder for ${target.contactName}`,
          });
        } catch {
          // Fallback
        }
      }
    } else {
      const rawTargetPhone = target.phoneNumber || '';
      const cleanTargetPhone = rawTargetPhone.replace(/[^\d+]/g, '');
      const smsUrl = cleanTargetPhone
        ? `sms:${cleanTargetPhone}?body=${encodedMsg}`
        : `sms:?body=${encodedMsg}`;

      try {
        await Linking.openURL(smsUrl);
      } catch {
        try {
          await Share.share({ message: composedText });
        } catch {
          // Fallback
        }
      }
    }

    onClose();
  };

  const contactInitial = (target.contactName || 'C').charAt(0).toUpperCase();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <View />
        </Pressable>

        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: palette.surfaceElevated,
              borderTopColor: palette.borderLatte,
            },
          ]}
        >
          {/* Sheet Drag Indicator Handle */}
          <View style={styles.dragIndicatorWrapper}>
            <View
              style={[
                styles.dragIndicator,
                { backgroundColor: palette.borderLatte },
              ]}
            />
          </View>

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Header: Customer Info + Due Amount */}
            <View style={styles.headerRow}>
              <View style={styles.customerProfileRow}>
                <View
                  style={[
                    styles.avatarCircle,
                    { backgroundColor: palette.surfaceBeige },
                  ]}
                >
                  <Text
                    style={[
                      styles.avatarText,
                      { color: palette.receiveSageGreen },
                    ]}
                  >
                    {contactInitial}
                  </Text>
                </View>
                <View style={styles.nameContainer}>
                  <Text
                    style={[
                      styles.contactNameText,
                      { color: palette.textEspresso },
                    ]}
                    numberOfLines={1}
                  >
                    {target.contactName}
                  </Text>
                  <Text
                    style={[
                      styles.contactPhoneSubText,
                      { color: palette.textMocha },
                    ]}
                  >
                    {target.phoneNumber || 'FinTrack Contact'}
                  </Text>
                </View>
              </View>

              <View style={styles.headerRightGroup}>
                <View style={styles.dueBadgePill}>
                  <Text style={styles.dueBadgeLabel}>PENDING DUE</Text>
                  <Text style={styles.dueBadgeAmount}>
                    {formatINR(target.remainingPaise, true)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={[
                    styles.closeIconBtn,
                    { backgroundColor: palette.surfaceBeige },
                  ]}
                >
                  <Ionicons
                    name="close"
                    size={18}
                    color={palette.textEspresso}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* WhatsApp Chat Bubble Preview */}
            <View style={styles.previewHeaderRow}>
              <View style={styles.previewTitleWithDot}>
                <View style={styles.greenPulseDot} />
                <Text
                  style={[
                    styles.previewHeaderTitle,
                    { color: palette.textEspresso },
                  ]}
                >
                  POLITE REMINDER MESSAGE
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsEditing((prev) => !prev)}
                style={styles.editToggleBtn}
              >
                <Ionicons
                  name={isEditing ? 'checkmark-circle' : 'create-outline'}
                  size={14}
                  color={palette.primaryBrown}
                />
                <Text
                  style={[
                    styles.editToggleText,
                    { color: palette.primaryBrown },
                  ]}
                >
                  {isEditing ? 'Done' : 'Edit message'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.chatBubbleContainer}>
              <View style={styles.chatBubbleTail} />
              {isEditing ? (
                <TextInput
                  value={composedText}
                  onChangeText={setComposedText}
                  multiline
                  style={[
                    styles.editableMessageInput,
                    { color: '#0F172A' },
                  ]}
                  autoFocus
                />
              ) : (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => setIsEditing(true)}
                >
                  <Text style={styles.chatBubbleText}>{composedText}</Text>
                </TouchableOpacity>
              )}

              {/* Chat Bubble Metadata */}
              <View style={styles.chatBubbleFooter}>
                <Text style={styles.chatBubbleTime}>Auto-generated</Text>
                <Ionicons name="checkmark-done" size={15} color="#059669" />
              </View>
            </View>

            {/* Quick 1-Tap Action Buttons */}
            <View style={styles.actionButtonGroup}>
              {/* Primary: Send via WhatsApp */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => handleSendViaChannel('WHATSAPP')}
                style={styles.whatsAppPrimaryBtn}
              >
                <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
                <Text style={styles.whatsAppBtnText}>
                  Send via WhatsApp
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color="#FFFFFF"
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>
              <Text style={[styles.whatsAppHintText, { color: palette.textMocha }]}>
                Opens WhatsApp directly so you can choose {target.contactName} from your contacts
              </Text>

              {/* Secondary: Send SMS */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleSendViaChannel('SMS')}
                style={[
                  styles.smsSecondaryBtn,
                  {
                    backgroundColor: palette.surfaceBeige,
                    borderColor: palette.borderLatte,
                  },
                ]}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={18}
                  color={palette.textEspresso}
                />
                <Text
                  style={[
                    styles.smsBtnText,
                    { color: palette.textEspresso },
                  ]}
                >
                  Send SMS
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
  },
  sheetContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  dragIndicatorWrapper: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dragIndicator: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  customerProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
  },
  nameContainer: {
    flex: 1,
  },
  contactNameText: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  contactPhoneSubText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dueBadgePill: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    alignItems: 'flex-end',
  },
  dueBadgeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  dueBadgeAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
  },
  closeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  previewTitleWithDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  greenPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#25D366',
  },
  previewHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  editToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  editToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  chatBubbleContainer: {
    backgroundColor: '#DCF8C6',
    borderRadius: 18,
    borderTopLeftRadius: 4,
    padding: 14,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  chatBubbleTail: {
    position: 'absolute',
    top: -1,
    left: -8,
    width: 0,
    height: 0,
    borderRightWidth: 8,
    borderRightColor: '#DCF8C6',
    borderBottomWidth: 8,
    borderBottomColor: 'transparent',
  },
  chatBubbleText: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#111827',
    fontWeight: '500',
  },
  editableMessageInput: {
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '500',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  chatBubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 8,
    gap: 4,
  },
  chatBubbleTime: {
    fontSize: 10.5,
    color: '#4B5563',
    fontWeight: '600',
  },
  actionButtonGroup: {
    gap: 10,
    marginTop: 6,
  },
  whatsAppPrimaryBtn: {
    backgroundColor: '#25D366',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  whatsAppBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  whatsAppHintText: {
    fontSize: 11.5,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: -4,
    marginBottom: 4,
  },
  smsSecondaryBtn: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  smsBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
