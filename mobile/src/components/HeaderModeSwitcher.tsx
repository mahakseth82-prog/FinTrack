import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFinTrackTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { SYSTEM_FONT_STACK, EMERALD_THEME } from '../theme/colors';
import { LanguagePreferenceModal } from './LanguagePreferenceModal';
import { ManualTransactionModal } from './ManualTransactionModal';

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

function getUserInitials(name?: string): string {
  if (!name || !name.trim()) return 'MS';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const HeaderModeSwitcher: React.FC = () => {
  const { mode, setMode } = useFinTrackTheme();
  const { user, signOut } = useAuth();
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  const formattedUserName = toTitleCase(user?.fullName || 'Mahak');
  const userInitials = getUserInitials(user?.fullName || 'Mahak');

  const handleSettingsPress = () => {
    Alert.alert(
      'Account Settings',
      `Signed in as ${user?.fullName || 'Mahak'} (${user?.preferredLanguage === 'hi' ? 'Hindi' : 'English'})`,
      [
        {
          text: 'Change Language',
          onPress: () => setIsLangModalOpen(true),
        },
        {
          text: 'Switch / Sign Out',
          style: 'destructive',
          onPress: signOut,
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  return (
    <View style={styles.headerContainer}>
      {/* Left: Paytm-style Profile Avatar Circle + User First Name + "+ Add Entry" */}
      <View style={styles.profileLeftBlock}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleSettingsPress}
          style={styles.avatarRow}
        >
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>{userInitials}</Text>
          </View>
          <Text style={styles.userNameText} numberOfLines={1}>
            {formattedUserName}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setIsManualModalOpen(true)}
          style={styles.addEntryBtn}
        >
          <Ionicons name="add" size={13} color="#475569" />
          <Text style={styles.addEntryText}>Entry</Text>
        </TouchableOpacity>
      </View>

      {/* Center: Brand Name + Compact [ Personal | Business ] Segmented Pill */}
      <View style={styles.centerPillContainer}>
        <View style={styles.compactSegmentedPill}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setMode('PERSONAL')}
            style={[
              styles.compactSegmentBtn,
              mode === 'PERSONAL' && styles.compactSegmentBtnActive,
            ]}
          >
            <Text
              style={[
                styles.compactSegmentText,
                mode === 'PERSONAL' && styles.compactSegmentTextActive,
              ]}
            >
              Personal
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setMode('BUSINESS')}
            style={[
              styles.compactSegmentBtn,
              mode === 'BUSINESS' && styles.compactSegmentBtnActive,
            ]}
          >
            <Text
              style={[
                styles.compactSegmentText,
                mode === 'BUSINESS' && styles.compactSegmentTextActive,
              ]}
            >
              Business
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Right: Clean Text Button "Language" + Bell / Settings Icon */}
      <View style={styles.rightActionsRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setIsLangModalOpen(true)}
          style={styles.langBtn}
        >
          <Text style={styles.langBtnText}>Language</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleSettingsPress}
          style={styles.bellIconBtn}
        >
          <Ionicons name="notifications-outline" size={20} color="#0F172A" />
        </TouchableOpacity>
      </View>

      {/* Language Preference Modal */}
      <LanguagePreferenceModal
        visible={isLangModalOpen}
        onClose={() => setIsLangModalOpen(false)}
      />

      {/* Manual Entry Modal triggered from Top Header */}
      <ManualTransactionModal
        visible={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileLeftBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1.1,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  addEntryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FCE7F3',
    borderWidth: 1.5,
    borderColor: '#FBCFE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 13,
    fontWeight: '800',
    color: '#BE185D',
    fontFamily: SYSTEM_FONT_STACK,
  },
  profileNameBox: {
    justifyContent: 'center',
  },
  userNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
  },
  centerPillContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactSegmentedPill: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  compactSegmentBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  compactSegmentBtnActive: {
    backgroundColor: EMERALD_THEME.emeraldGreen,
  },
  compactSegmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  compactSegmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  rightActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flex: 1,
  },
  langBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  langBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  bellIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
