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

  useEffect(() => {
    if (!visible || !target) return;

    composeMutation
      .mutateAsync({
        obligationId: target.obligationId,
        language,
        tone,
      })
      .then((res) => {
        setComposedText(res.message);
      })
      .catch(() => {
        // Fallback if offline
        setComposedText(
          `Namaste ${target.contactName} ji 🙏, FinTrack par aapka ${formatINR(
            target.remainingPaise
          )} ka balance (${target.dueDate}) due hai. Jab suvidha ho toh UPI kar dijiyega. Dhanyawad!`
        );
      });
  }, [visible, target, language, tone]);

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

