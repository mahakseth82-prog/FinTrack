import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import { useAuth, AppLanguage } from '../context/AuthContext';
import { SYSTEM_FONT_STACK } from '../theme/colors';

interface LanguagePreferenceModalProps {
  visible: boolean;
  onClose?: () => void;
  mandatory?: boolean;
}

export const LanguagePreferenceModal: React.FC<LanguagePreferenceModalProps> = ({
  visible,
  onClose,
  mandatory = false,
}) => {
  const { palette } = useFinTrackTheme();
  const { user, updatePreferredLanguage } = useAuth();

  const [selectedLang, setSelectedLang] = useState<AppLanguage>(
    user?.preferredLanguage || 'en'
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      await updatePreferredLanguage(selectedLang);
      if (onClose) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={mandatory ? undefined : onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.badge, { backgroundColor: '#F1F5F9' }]}>
              <Text style={styles.badgeText}>
                {selectedLang === 'hi'
                  ? 'भाषा वरीयता (Language Preference)'
                  : 'Language Preference'}
              </Text>
            </View>

            <Text style={[styles.title, { color: palette.primaryBrown }]}>
              {selectedLang === 'hi'
                ? 'अपनी भाषा चुनें'
                : 'Choose Your Language'}
            </Text>
            <Text style={styles.subtitle}>
              {selectedLang === 'hi'
                ? 'लेन-देन के शीर्षक, वॉयस इनपुट और स्क्रीन इसी भाषा में दिखाई देंगे।'
                : 'Voice recognition, transaction titles, and AI confirmations will follow this preference.'}
            </Text>

            <View style={styles.enforcementNotice}>
              <Text style={styles.enforcementNoticeText}>
                ✓ Strictly English & हिन्दी (Devanagari) Only • No Urdu Script
              </Text>
            </View>
          </View>

          {/* Option 1: English */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setSelectedLang('en')}
            style={[
              styles.optionCard,
              selectedLang === 'en' && [
                styles.optionCardSelected,
                { borderColor: palette.primaryBrown, backgroundColor: '#FAF6F0' },
              ],
            ]}
          >
            <View style={styles.optionLeft}>
              <View
                style={[
                  styles.radioOuter,
                  selectedLang === 'en' && { borderColor: palette.primaryBrown },
                ]}
              >
                {selectedLang === 'en' && (
                  <View
                    style={[
                      styles.radioInner,
                      { backgroundColor: palette.primaryBrown },
                    ]}
                  />
                )}
              </View>
              <View style={styles.optionContent}>
                <View style={styles.titleRow}>
                  <Text style={styles.optionTitle}>English</Text>
                  <Text style={styles.scriptBadge}>Latin Script</Text>
                </View>
                <Text style={styles.optionDescription}>
                  Clothes Purchase, Food / Dinner, Milk & Bread, Petrol
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Option 2: Hindi (Devanagari) */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setSelectedLang('hi')}
            style={[
              styles.optionCard,
              selectedLang === 'hi' && [
                styles.optionCardSelected,
                { borderColor: palette.primaryBrown, backgroundColor: '#FAF6F0' },
              ],
            ]}
          >
            <View style={styles.optionLeft}>
              <View
                style={[
                  styles.radioOuter,
                  selectedLang === 'hi' && { borderColor: palette.primaryBrown },
                ]}
              >
                {selectedLang === 'hi' && (
                  <View
                    style={[
                      styles.radioInner,
                      { backgroundColor: palette.primaryBrown },
                    ]}
                  />
                )}
              </View>
              <View style={styles.optionContent}>
                <View style={styles.titleRow}>
                  <Text style={styles.optionTitle}>हिन्दी (Hindi)</Text>
                  <Text style={styles.scriptBadge}>देवनागरी लिपि</Text>
                </View>
                <Text style={styles.optionDescription}>
                  कपड़े की खरीदारी, खाना / भोजन, दूध और ब्रेड, पेट्रोल
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Action Button */}
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={isSaving}
            onPress={handleConfirm}
            style={[
              styles.confirmButton,
              { backgroundColor: palette.primaryBrown },
              isSaving && { opacity: 0.7 },
            ]}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.confirmButtonText}>
                {selectedLang === 'hi'
                  ? 'चयन सहेजें और आगे बढ़ें'
                  : 'Save Language & Continue'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: SYSTEM_FONT_STACK,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },
  enforcementNotice: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  enforcementNoticeText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    textAlign: 'center',
  },
  optionCard: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
  },
  optionCardSelected: {},
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginRight: 14,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  optionContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
  },
  scriptBadge: {
    fontSize: 10,
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '600',
  },
  optionDescription: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  confirmButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: SYSTEM_FONT_STACK,
  },
});
