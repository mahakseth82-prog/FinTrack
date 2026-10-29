import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export const HeaderModeSwitcher: React.FC = () => {
  const { mode, palette, setMode } = useFinTrackTheme();
  const { user, signOut } = useAuth();

  return (
    <View style={styles.headerContainer}>
      {/* Top Row: Clean Brand Title + User Info */}
      <View style={styles.brandRow}>
        <View>
          <Text style={[styles.brandName, { color: palette.primaryBrown }]}>
            FinTrack
          </Text>
          <Text style={styles.subtitle}>
            {palette.modeTitle} • {user?.fullName || 'User'}
          </Text>
        </View>

        <TouchableOpacity onPress={signOut} style={styles.profileBtn}>
          <Text style={styles.profileBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Clean Minimal Mode Switcher: [ Personal | Business ] */}
      <View style={styles.switcherTrack}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setMode('PERSONAL')}
          style={[
            styles.switcherTab,
            mode === 'PERSONAL' && {
              backgroundColor: palette.primaryBrown,
            },
          ]}
        >
          <Text
            style={[
              styles.switcherText,
              {
                color: mode === 'PERSONAL' ? '#FFFFFF' : '#475569',
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
            styles.switcherTab,
            mode === 'BUSINESS' && {
              backgroundColor: palette.primaryBrown,
            },
          ]}
        >
          <Text
            style={[
              styles.switcherText,
              {
                color: mode === 'BUSINESS' ? '#FFFFFF' : '#475569',
              },
            ]}
          >
            Business
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandName: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  profileBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  profileBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  switcherTrack: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#F1F5F9',
  },
  switcherTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switcherText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
