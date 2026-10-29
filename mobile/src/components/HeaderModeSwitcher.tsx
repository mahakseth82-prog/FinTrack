import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { SYSTEM_FONT_STACK } from '../theme/colors';

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

  const formattedUserName = toTitleCase(user?.fullName || 'Account Holder');

  return (
    <View style={styles.headerContainer}>
      {/* Top Row: Brand Title + Clean Title-Case User Name + Switch User Control */}
      <View style={styles.brandRow}>
        <View>
          <Text style={styles.brandName}>FinTrack</Text>
          <Text style={styles.subtitle}>{formattedUserName}</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={signOut}
          style={styles.switchUserControl}
        >
          <Text style={styles.switchUserText}>Switch User</Text>
        </TouchableOpacity>
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
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  switchUserControl: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  switchUserText: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  segmentedTrack: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemActive: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentLabel: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 13,
    fontWeight: '600',
  },
});
