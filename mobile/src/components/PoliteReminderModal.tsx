import React, { useState, useEffect, useMemo } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  const [customPhone, setCustomPhone] = useState('');
  const [isAddingPhone, setIsAddingPhone] = useState(false);

  // Extract clean 10-digit phone number from login user
  const loginPhoneDigits = useMemo(() => {
    const raw = user?.phoneNumber || '';
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
  }, [user?.phoneNumber]);

  const activePhoneDigits = loginPhoneDigits || customPhone.replace(/\D/g, '').slice(-10);

  // Load saved fallback phone if login user has no phone stored
  useEffect(() => {
    if (!loginPhoneDigits) {
      AsyncStorage.getItem('@fintrack_receiving_phone').then((saved) => {
        if (saved) setCustomPhone(saved);
      });
    }
  }, [loginPhoneDigits]);

  // Auto-compose polite, respectful message whenever target or phone changes
  useEffect(() => {
    if (!visible || !target) return;

    const amountFormatted = formatINR(target.remainingPaise, true);
    const amountRupees = (target.remainingPaise / 100).toFixed(0);
    const merchantName = user?.fullName || 'FinTrack';
    const isHindi = user?.preferredLanguage === 'hi';

    const cleanPaymentNumber = activePhoneDigits;
    const upiLink = cleanPaymentNumber
      ? `upi://pay?pa=${cleanPaymentNumber}@upi&pn=${encodeURIComponent(
          merchantName
        )}&am=${amountRupees}&cu=INR&tn=${encodeURIComponent('Khata Balance Settlement')}`
      : '';

    const dueClause = target.dueDate ? ` (Due: ${target.dueDate})` : '';

    let message = '';
    if (isHindi) {
      message =
        `नमस्ते ${target.contactName} जी 🙏,\n\n` +
        `FinTrack खाते के अनुसार आपका ${amountFormatted} का शेष बकाया है${dueClause}।\n\n` +
        `जब भी सुविधा हो, कृपया नीचे दिए गए नंबर पर UPI ट्रांसफर कर दें:\n` +
        `💳 UPI / मोबाइल: ${cleanPaymentNumber || 'फोन पर संपर्क करें'}\n` +
        (upiLink ? `🔗 1-टैप डायरेक्ट पे लिंक:\n${upiLink}\n\n` : '\n') +
        `सादर धन्यवाद! 🤝\n` +
        `— ${merchantName}`;
    } else {
      // Respectful, natural Hinglish loved by Indian businesses & friends
      message =
        `Namaste ${target.contactName} ji 🙏,\n\n` +
        `FinTrack khate par aapka ${amountFormatted} ka hisaab pending hai${dueClause}.\n\n` +
        `Jab bhi suvidha ho, kripya is number par UPI kar dijiyega:\n` +
        `💳 UPI / Mobile: ${cleanPaymentNumber || 'Phone par sampark karein'}\n` +
        (upiLink ? `🔗 1-Tap Pay Link:\n${upiLink}\n\n` : '\n') +
        `Dhanyawad! 🤝\n` +
        `— ${merchantName}`;
    }

    setComposedText(message);
    setIsEditing(false);
  }, [visible, target, activePhoneDigits, user?.fullName, user?.preferredLanguage]);

  if (!target) return null;

  const handleSendViaChannel = async (channel: 'WHATSAPP' | 'SMS') => {
    const rawTargetPhone = target.phoneNumber || '';
    const cleanTargetPhone = rawTargetPhone.replace(/[^\d+]/g, '');

    // Record polite reminder in ledger audit logs
    try {
      await logSentMutation.mutateAsync({
        obligationId: target.obligationId,
        contactId: target.contactId,
        channel,
        language: user?.preferredLanguage === 'hi' ? 'HINDI' : 'HINGLISH',
        composedMessage: composedText,
      });
    } catch {
      // Continue opening WhatsApp/SMS even if log mutation fails or is offline
    }

    const encodedMsg = encodeURIComponent(composedText);
    const url =
      channel === 'WHATSAPP'
        ? `https://wa.me/${cleanTargetPhone.replace('+', '')}?text=${encodedMsg}`
        : `sms:${cleanTargetPhone}?body=${encodedMsg}`;

    try {
      const canOpen = await Linking.canOpenURL(url).catch(() => true);
      if (canOpen) {
        await Linking.openURL(url);
      }
    } catch {
      // Fallback
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
                <View>
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
                    {target.phoneNumber || 'No phone number'}
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

            {/* Auto-linked Payment Destination Banner */}
            <View
              style={[
                styles.paymentBanner,
                {
                  backgroundColor: palette.surfaceBeige,
                  borderColor: palette.borderLatte,
                },
              ]}
            >
              <View style={styles.paymentBannerIconBox}>
                <Ionicons name="card" size={17} color="#059669" />
              </View>
              <View style={styles.paymentBannerTextBox}>
                <Text
                  style={[styles.paymentBannerTitle, { color: palette.textEspresso }]}
                >
                  {activePhoneDigits
                    ? `Receiving on: +91 ${activePhoneDigits.slice(0, 5)} ${activePhoneDigits.slice(5)}`
                    : 'Add receiving phone / UPI'}
                </Text>
                <Text
                  style={[styles.paymentBannerSub, { color: palette.textMocha }]}
                >
                  {loginPhoneDigits
                    ? '✓ Auto-linked from your FinTrack login account'
                    : '1-tap UPI links will direct payments here'}
                </Text>
              </View>

              {!loginPhoneDigits && (
                <TouchableOpacity
                  onPress={() => setIsAddingPhone((prev) => !prev)}
                  style={styles.changePhoneBtn}
                >
                  <Text style={styles.changePhoneText}>
                    {isAddingPhone ? 'Done' : 'Set'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* In case user has no phone in login profile, prompt cleanly */}
            {isAddingPhone && !loginPhoneDigits && (
              <View style={styles.phoneInputRow}>
                <TextInput
                  value={customPhone}
                  onChangeText={(val) => {
                    setCustomPhone(val);
                    AsyncStorage.setItem('@fintrack_receiving_phone', val.trim());
                  }}
                  placeholder="Enter 10-digit mobile number"
                  placeholderTextColor={palette.textMocha}
                  keyboardType="phone-pad"
                  maxLength={10}
                  style={[
                    styles.phoneTextInput,
                    {
                      borderColor: palette.borderLatte,
                      color: palette.textEspresso,
                      backgroundColor: palette.surfaceElevated,
                    },
                  ]}
                />
              </View>
            )}

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
                  POLITE REMINDER (AUTO-COMPOSED)
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
                <Text style={styles.whatsAppBtnText}>Send via WhatsApp</Text>
                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color="#FFFFFF"
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>

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
  paymentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  paymentBannerIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentBannerTextBox: {
    flex: 1,
  },
  paymentBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  paymentBannerSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  changePhoneBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  changePhoneText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  phoneInputRow: {
    marginTop: -4,
  },
  phoneTextInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
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
