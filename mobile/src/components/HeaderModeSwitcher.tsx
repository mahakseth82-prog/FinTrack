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
    <View
      style={[
        styles.headerContainer,
        {
          backgroundColor: palette.surfaceBeige,
          borderBottomColor: palette.borderLatte,
        },
      ]}
    >
      {/* Top Row: Brand Title + User Profile Pill */}
      <View style={styles.brandRow}>
        <View>
          <View style={styles.titleRow}>
            <Text style={[styles.brandName, { color: palette.primaryBrown }]}>
              FinTrack
            </Text>
            <View
              style={[
                styles.workspaceBadge,
                { backgroundColor: palette.primaryBrown },
              ]}
            >
              <Text
                style={[
                  styles.workspaceBadgeText,
                  { color: palette.textOnPrimary },
                ]}
              >
                {mode === 'PERSONAL' ? 'PERSONAL' : 'BUSINESS'}
              </Text>
            </View>
          </View>
          <Text style={[styles.subtitle, { color: palette.textMocha }]}>
            {palette.modeTitle} • {user?.fullName || 'Guest'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={signOut}
          style={[
            styles.profileBtn,
            {
              backgroundColor: palette.backgroundCream,
              borderColor: palette.borderLatte,
            },
          ]}
        >
          <Text style={[styles.profileBtnText, { color: palette.textEspresso }]}>
            Switch User
          </Text>
        </TouchableOpacity>
      </View>

      {/* Mode Switcher Pill: [ 🏠 Personal | 🏪 Business ] */}
      <View
        style={[
          styles.switcherTrack,
          {
            backgroundColor: palette.pillInactiveBg,
            borderColor: palette.borderLatte,
          },
        ]}
      >
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
                color:
                  mode === 'PERSONAL'
                    ? palette.textOnPrimary
                    : palette.textEspresso,
              },
            ]}
          >
            🏠 Personal (Ghar)
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
                color:
                  mode === 'BUSINESS'
                    ? palette.textOnPrimary
                    : palette.textEspresso,
              },
            ]}
          >
            🏪 Business (Vyapaar)
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandName: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  workspaceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  workspaceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  profileBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  profileBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  switcherTrack: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
  },
  switcherTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switcherText: {
    fontSize: 13,
    fontWeight: '700',
  },
});

