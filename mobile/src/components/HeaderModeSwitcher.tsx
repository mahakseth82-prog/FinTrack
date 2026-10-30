import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { SYSTEM_FONT_STACK } from '../theme/colors';
import { LanguagePreferenceModal } from './LanguagePreferenceModal';

function toTitleCase(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) =>
      word.length > 0
        ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        : ''
    )
    .join(' ');
}

export const HeaderModeSwitcher: React.FC = () => {
  const { mode, palette, setMode } = useFinTrackTheme();
  const { user, signOut } = useAuth();
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);

  const formattedUserName = toTitleCase(user?.fullName || 'Account Holder');

  return (
    <View style={styles.headerContainer}>
      {/* Top Row: Brand Title + Clean Title-Case User Name + Language Switcher + Switch User */}
      <View style={styles.brandRow}>
        <View>
          <Text style={styles.brandName}>FinTrack</Text>
          <Text style={styles.subtitle}>{formattedUserName}</Text>
        </View>

        <View style={styles.rightActionsRow}>
          {/* Quick Language Toggle Pill */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setIsLangModalOpen(true)}
            style={styles.langPill}
          >
            <Text style={styles.langPillText}>
              {user?.preferredLanguage === 'hi' ? '🌐 हिन्दी' : '🌐 English'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={signOut}
            style={styles.switchUserControl}
          >
            <Text style={styles.switchUserText}>Switch User</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sleek Minimalist Segmented Workspace Control: [ Personal | Business ] */}
      <View style={styles.segmentedTrack}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setMode('PERSONAL')}
          style={[
            styles.segmentItem,
            mode === 'PERSONAL' && [
              styles.segmentItemActive,
              { backgroundColor: palette.primaryBrown },
            ],
          ]}
        >
          <Text
            style={[
              styles.segmentLabel,
              {
                color: mode === 'PERSONAL' ? '#FFFFFF' : '#64748B',
              },
            ]}
          >
            Personal
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setMode('BUSINESS')}
          style={[
            styles.segmentItem,
            mode === 'BUSINESS' && [
              styles.segmentItemActive,
              { backgroundColor: palette.primaryBrown },
            ],
          ]}
        >
          <Text
            style={[
              styles.segmentLabel,
              {
                color: mode === 'BUSINESS' ? '#FFFFFF' : '#64748B',
              },
            ]}
          >
            Business
          </Text>
        </TouchableOpacity>
      </View>

      {/* Language Preference Modal */}
      <LanguagePreferenceModal
        visible={isLangModalOpen}
        onClose={() => setIsLangModalOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rightActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  langPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  langPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  switchUserControl: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  switchUserText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  segmentedTrack: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  segmentItemActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: SYSTEM_FONT_STACK,
  },
});
