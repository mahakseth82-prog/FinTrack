import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFinTrackTheme } from '../context/ThemeContext';
import {
  useComposeReminder,
  useLogReminderSent,
} from '../hooks/useFinTrackQueries';
import { ReminderLanguage, ReminderTone } from '../types/ledger';
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
  const composeMutation = useComposeReminder(activeWorkspaceId);
  const logSentMutation = useLogReminderSent(activeWorkspaceId);

  const [language, setLanguage] = useState<ReminderLanguage>('HINGLISH');
  const [tone, setTone] = useState<ReminderTone>('FRIENDLY');
  const [composedText, setComposedText] = useState('');
  const [upiId, setUpiId] = useState('');
  const [includeUpiLink, setIncludeUpiLink] = useState(true);

  // Load saved UPI ID on mount
  useEffect(() => {
    AsyncStorage.getItem('@fintrack_business_upi_id').then((saved) => {
      if (saved) setUpiId(saved);
    });
  }, []);

  useEffect(() => {
    if (!visible || !target) return;

    const activeUpi = includeUpiLink && upiId.trim() ? upiId.trim() : undefined;

    composeMutation
      .mutateAsync({
        obligationId: target.obligationId,
        language,
        tone,
        upiId: activeUpi,
      })
      .then((res) => {
        setComposedText(res.message);
      })
      .catch(() => {
        // Fallback if offline
        const amountRupees = (target.remainingPaise / 100).toFixed(2);
        const upiLinkStr = activeUpi
          ? `\n\n📲 1-Tap UPI Pay Link:\nupi://pay?pa=${activeUpi}&am=${amountRupees}&cu=INR&tn=Khata%20Settlement`
          : '';
        setComposedText(
          `Namaste ${target.contactName} ji 🙏, FinTrack par aapka ${formatINR(
            target.remainingPaise
          )} ka balance (${target.dueDate}) due hai. Jab suvidha ho toh UPI kar dijiyega. Dhanyawad!${upiLinkStr}`
        );
      });
  }, [visible, target, language, tone, upiId, includeUpiLink]);

  if (!target) return null;

  const handleSendViaChannel = async (channel: 'WHATSAPP' | 'SMS') => {
    const cleanPhone = target.phoneNumber.replace(/[^\d+]/g, '');

    try {
      await logSentMutation.mutateAsync({
        obligationId: target.obligationId,
        contactId: target.contactId,
        channel,
        language,
        composedMessage: composedText,
      });
    } catch {
      // Continue opening WhatsApp/SMS even if log fails
    }

    const encodedMsg = encodeURIComponent(composedText);
    const url =
      channel === 'WHATSAPP'
        ? `https://wa.me/${cleanPhone.replace('+', '')}?text=${encodedMsg}`
        : `sms:${cleanPhone}?body=${encodedMsg}`;

    try {
      await Linking.openURL(url);
    } catch {
      // Simulator fallback
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: palette.surfaceBeige,
              borderColor: palette.borderLatte,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.tag, { color: palette.accentWarm }]}>
                🤝 POLITE REMINDER COMPOSER • 24H DUE ALERT
              </Text>
              <Text style={[styles.title, { color: palette.textEspresso }]}>
                Remind {target.contactName}
              </Text>
              <Text style={[styles.sub, { color: palette.textMocha }]}>
                Remaining: {formatINR(target.remainingPaise)} • Due:{' '}
                {target.dueDate}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.closeBtn,
                {
                  backgroundColor: palette.backgroundCream,
                  borderColor: palette.borderLatte,
                },
              ]}
            >
              <Text style={{ color: palette.textEspresso, fontWeight: '800' }}>
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          {/* Language Selector: [ Hinglish | हिंदी | English ] */}
          <Text style={[styles.sectionLabel, { color: palette.textEspresso }]}>
            Select Language (Bhasha):
          </Text>
          <View style={styles.selectorRow}>
            {(
              [
                { id: 'HINGLISH', label: '🇮🇳 Hinglish' },
                { id: 'HINDI', label: '🕉️ हिंदी (Hindi)' },
                { id: 'ENGLISH', label: '🔤 English' },
              ] as { id: ReminderLanguage; label: string }[]
            ).map((lang) => (
              <TouchableOpacity
                key={lang.id}
                onPress={() => setLanguage(lang.id)}
                style={[
                  styles.selectorChip,
                  {
                    backgroundColor:
                      language === lang.id
                        ? palette.primaryBrown
                        : palette.surfaceElevated,
                    borderColor: palette.borderLatte,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color:
                      language === lang.id
                        ? palette.textOnPrimary
                        : palette.textEspresso,
                  }}
                >
                  {lang.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tone Selector: [ Friendly | Formal Business ] */}
          <Text style={[styles.sectionLabel, { color: palette.textEspresso }]}>
            Select Tone (Lehja):
          </Text>
          <View style={styles.selectorRow}>
            {(
              [
                { id: 'FRIENDLY', label: '🤝 Friendly (Dostana)' },
                { id: 'FORMAL', label: '🏪 Formal Vyapaar' },
              ] as { id: ReminderTone; label: string }[]
            ).map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => setTone(t.id)}
                style={[
                  styles.selectorChip,
                  {
                    backgroundColor:
                      tone === t.id
                        ? palette.primaryBrown
                        : palette.surfaceElevated,
                    borderColor: palette.borderLatte,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color:
                      tone === t.id
                        ? palette.textOnPrimary
                        : palette.textEspresso,
                  }}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 1-Tap UPI Payment Link Section */}
          <View
            style={[
              styles.upiContainer,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.borderLatte,
              },
            ]}
          >
            <View style={styles.upiHeaderRow}>
              <View style={styles.upiLabelRow}>
                <Ionicons name="flash" size={15} color="#059669" />
                <Text style={[styles.upiHeaderTitle, { color: palette.textEspresso }]}>
                  Attach 1-Tap UPI Payment Link
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setIncludeUpiLink((prev) => !prev)}
                style={[
                  styles.upiTogglePill,
                  includeUpiLink ? styles.upiTogglePillActive : styles.upiTogglePillInactive,
                ]}
              >
                <Text
                  style={[
                    styles.upiTogglePillText,
                    includeUpiLink ? styles.upiToggleTextActive : styles.upiToggleTextInactive,
                  ]}
                >
                  {includeUpiLink ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
            </View>

            {includeUpiLink && (
              <View style={styles.upiInputWrapper}>
                <Ionicons
                  name="card-outline"
                  size={16}
                  color={palette.textMocha}
                  style={{ marginRight: 6 }}
                />
                <TextInput
                  value={upiId}
                  onChangeText={(val) => {
                    setUpiId(val);
                    AsyncStorage.setItem('@fintrack_business_upi_id', val.trim());
                  }}
                  placeholder="Your UPI ID (e.g. 9876543210@paytm, name@okhdfcbank)"
                  placeholderTextColor={palette.textMocha}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.upiTextInput, { color: palette.textEspresso }]}
                />
              </View>
            )}
          </View>

          {/* Editable Polite Message Preview */}
          <Text style={[styles.sectionLabel, { color: palette.textEspresso }]}>
            Polite Message Preview (Editable):
          </Text>
          <TextInput
            value={
              composeMutation.isPending
                ? 'Generating polite reminder...'
                : composedText
            }
            onChangeText={setComposedText}
            multiline
            style={[
              styles.messageBox,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.borderLatte,
                color: palette.textEspresso,
              },
            ]}
          />

          {/* Action Buttons: Send via WhatsApp or SMS */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={() => handleSendViaChannel('SMS')}
              style={[
                styles.smsBtn,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.primaryBrown,
                },
              ]}
            >
              <Text
                style={{
                  color: palette.primaryBrown,
                  fontWeight: '800',
                  fontSize: 13,
                }}
              >
                📩 Send SMS
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleSendViaChannel('WHATSAPP')}
              style={[
                styles.waBtn,
                { backgroundColor: palette.receiveSageGreen },
              ]}
            >
              <Text
                style={{
                  color: palette.textOnPrimary,
                  fontWeight: '800',
                  fontSize: 13,
                }}
              >
                💬 Send on WhatsApp →
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44, 30, 22, 0.58)',
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderTopWidth: 1,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  sub: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  selectorChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  messageBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 105,
    fontSize: 13,
    lineHeight: 19,
    textAlignVertical: 'top',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  upiContainer: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 2,
    gap: 8,
  },
  upiHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  upiLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  upiHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  upiTogglePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  upiTogglePillActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  upiTogglePillInactive: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  upiTogglePillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  upiToggleTextActive: {
    color: '#059669',
  },
  upiToggleTextInactive: {
    color: '#64748B',
  },
  upiInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  upiTextInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  smsBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  waBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
});

