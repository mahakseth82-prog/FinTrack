import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useFinTrackTheme } from '../context/ThemeContext';
import { MinimalIcon } from '../components/MinimalIcon';
import { LanguagePreferenceModal } from '../components/LanguagePreferenceModal';
import { SYSTEM_FONT_STACK, EMERALD_THEME } from '../theme/colors';

export const ProfileScreen: React.FC = () => {
  const { user, signOut } = useAuth();
  const { mode, setMode } = useFinTrackTheme();
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Title */}
      <Text style={styles.screenTitle}>My Account</Text>

      {/* User Card */}
      <View style={styles.card}>
        <View style={styles.userHeroRow}>
          <View style={styles.avatarCircle}>
            <MinimalIcon name="profile" size={28} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.userName}>{user?.fullName || 'FinTrack User'}</Text>
            <Text style={styles.userPhone}>{user?.phoneNumber || ''}</Text>
            <Text style={styles.userEmail}>{user?.email || ''}</Text>
          </View>
        </View>
      </View>

      {/* Language Preference Section */}
      <Text style={styles.sectionHeader}>Preferences & Settings</Text>
      <View style={styles.card}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setIsLangModalOpen(true)}
          style={styles.settingRow}
        >
          <View style={styles.settingLeft}>
            <Text style={styles.settingTitle}>Language Preference</Text>
            <Text style={styles.settingSubtext}>Voice entries & transaction titles</Text>
          </View>
          <View style={styles.langPill}>
            <Text style={styles.langPillText}>
              {user?.preferredLanguage === 'hi' ? 'हिन्दी (Hindi)' : 'English'}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Workspace Mode */}
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <Text style={styles.settingTitle}>Active Workspace</Text>
            <Text style={styles.settingSubtext}>Personal vs Business Ledger</Text>
          </View>
          <View style={styles.modeToggleRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setMode('PERSONAL')}
              style={[
                styles.modeBtn,
                mode === 'PERSONAL' && {
                  backgroundColor: EMERALD_THEME.emeraldGreen,
                  borderColor: EMERALD_THEME.emeraldGreen,
                },
              ]}
            >
              <Text
                style={[
                  styles.modeBtnText,
                  mode === 'PERSONAL' && { color: '#FFFFFF', fontWeight: '700' },
                ]}
              >
                Personal
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setMode('BUSINESS')}
              style={[
                styles.modeBtn,
                mode === 'BUSINESS' && {
                  backgroundColor: '#0F766E',
                  borderColor: '#0F766E',
                },
              ]}
            >
              <Text
                style={[
                  styles.modeBtnText,
                  mode === 'BUSINESS' && { color: '#FFFFFF', fontWeight: '700' },
                ]}
              >
                Business
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Security & About */}
      <Text style={styles.sectionHeader}>App & Security</Text>
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <Text style={styles.settingTitle}>Data Encryption</Text>
            <Text style={styles.settingSubtext}>Bank-grade 256-bit encryption</Text>
          </View>
          <Text style={styles.activeStatusText}>Active ✓</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <Text style={styles.settingTitle}>App Version</Text>
            <Text style={styles.settingSubtext}>FinTrack Enterprise v2.4</Text>
          </View>
          <Text style={styles.versionText}>Latest</Text>
        </View>
      </View>

      {/* Sign Out Button */}
      <TouchableOpacity activeOpacity={0.8} onPress={signOut} style={styles.signOutBtn}>
        <Text style={styles.signOutBtnText}>Sign Out of FinTrack</Text>
      </TouchableOpacity>

      {/* Language Preference Modal */}
      <LanguagePreferenceModal
        visible={isLangModalOpen}
        onClose={() => setIsLangModalOpen(false)}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 100,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
    marginBottom: 14,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  userHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: EMERALD_THEME.emeraldGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
  },
  userPhone: {
    fontSize: 13,
    color: '#475569',
    marginTop: 2,
  },
  userEmail: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 1,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  settingLeft: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  settingSubtext: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
  langPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  langPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  modeToggleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  modeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  activeStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  versionText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  signOutBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    alignItems: 'center',
  },
  signOutBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
    fontFamily: SYSTEM_FONT_STACK,
  },
});
