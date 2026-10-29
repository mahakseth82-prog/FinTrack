import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { HeaderModeSwitcher } from '../components/HeaderModeSwitcher';
import { AuthScreen } from '../screens/AuthScreen';
import {
  rupeesToPaise,
  formatINR,
  calculatePartialRepayment,
} from '../utils/paise';

type ActiveTab = 'HOME' | 'UDHAAR' | 'DRAFTS' | 'SETTINGS';

export const RootNavigator: React.FC = () => {
  const { user } = useAuth();
  const { mode, palette } = useFinTrackTheme();
  const [activeTab, setActiveTab] = useState<ActiveTab>('HOME');

  // Interactive Phase 1 Paise Math Verification Demo State
  const [demoPaidRupees, setDemoPaidRupees] = useState<number>(1000);

  if (!user) {
    return <AuthScreen />;
  }

  const principalPaise = rupeesToPaise(2000); // ₹2,000 = 200,000 paise
  const paidPaise = rupeesToPaise(demoPaidRupees);
  const mathCheck = calculatePartialRepayment(principalPaise, 0, paidPaise);

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: palette.backgroundCream },
      ]}
    >
      {/* Top Mode Switcher: Personal (#6F4E37) vs Business (#3E2723) */}
      <HeaderModeSwitcher />

      {/* Main Content Area */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Active Workspace Banner */}
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: palette.primaryBrown,
            },
          ]}
        >
          <Text style={[styles.heroTag, { color: palette.accentWarm }]}>
            {mode === 'PERSONAL'
              ? '🏠 PERSONAL WORKSPACE (#6F4E37 COFFEE BROWN)'
              : '🏪 BUSINESS WORKSPACE (#3E2723 MAHOGANY BROWN)'}
          </Text>
          <Text style={[styles.heroTitle, { color: palette.textOnPrimary }]}>
            {palette.modeTitle}
          </Text>
          <Text style={[styles.heroSubtitle, { color: palette.surfaceBeige }]}>
            {palette.modeSubtitle}
          </Text>
          <View style={styles.workspaceIdRow}>
            <Text style={[styles.workspaceIdText, { color: palette.surfaceBeige }]}>
              Isolated Workspace ID: {palette.workspaceId}
            </Text>
          </View>
        </View>

        {/* Golden Rule #2 Interactive Paise Math Verifier */}
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: palette.surfaceBeige,
              borderColor: palette.borderLatte,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: palette.textEspresso }]}>
            🧮 Phase 1 Check: Integer Paise Math Engine
          </Text>
          <Text style={[styles.sectionDesc, { color: palette.textMocha }]}>
            Golden Rule #2: Every ₹1 is stored as 100 Paise (BIGINT). Tap below to
            test deterministic partial repayment math:
          </Text>

          <View
            style={[
              styles.mathBox,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.borderLatte,
              },
            ]}
          >
            <View style={styles.mathRow}>
              <Text style={[styles.mathLabel, { color: palette.textMocha }]}>
                Original Udhaar (Ravi):
              </Text>
              <Text style={[styles.mathValue, { color: palette.textEspresso }]}>
                {formatINR(mathCheck.principalPaise)} ({mathCheck.principalPaise} paise)
              </Text>
            </View>

            <View style={styles.mathRow}>
              <Text style={[styles.mathLabel, { color: palette.textMocha }]}>
                Wapas Mila (Repaid):
              </Text>
              <Text
                style={[
                  styles.mathValue,
                  { color: palette.receiveSageGreen },
                ]}
              >
                {formatINR(mathCheck.newRepaidPaise)} ({mathCheck.newRepaidPaise} paise)
              </Text>
            </View>

            <View
              style={[
                styles.mathDivider,
                { backgroundColor: palette.borderLatte },
              ]}
            />

            <View style={styles.mathRow}>
              <Text
                style={[
                  styles.mathLabelBold,
                  { color: palette.textEspresso },
                ]}
              >
                Remaining Balance:
              </Text>
              <Text
                style={[
                  styles.mathValueBold,
                  {
                    color:
                      mathCheck.newRemainingPaise > 0
                        ? palette.giveTerracottaRed
                        : palette.receiveSageGreen,
                  },
                ]}
              >
                {formatINR(mathCheck.newRemainingPaise)} ({mathCheck.status})
              </Text>
            </View>
          </View>

          <View style={styles.chipRow}>
            {[500, 1000, 1500, 2000].map((amt) => (
              <TouchableOpacity
                key={amt}
                onPress={() => setDemoPaidRupees(amt)}
                style={[
                  styles.chipBtn,
                  {
                    backgroundColor:
                      demoPaidRupees === amt
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
                      demoPaidRupees === amt
                        ? palette.textOnPrimary
                        : palette.textEspresso,
                  }}
                >
                  Pay ₹{amt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Cream/Beige & Brown Color Swatch Verification */}
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: palette.surfaceBeige,
              borderColor: palette.borderLatte,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: palette.textEspresso }]}>
            🎨 FinTrack Cream/Beige & Brown Palette
          </Text>
          <View style={styles.swatchRow}>
            <View
              style={[
                styles.swatchItem,
                {
                  backgroundColor: palette.backgroundCream,
                  borderColor: palette.borderLatte,
                },
              ]}
            >
              <Text style={[styles.swatchLabel, { color: palette.textEspresso }]}>
                Cream
              </Text>
              <Text style={[styles.swatchHex, { color: palette.textMocha }]}>
                {palette.backgroundCream}
              </Text>
            </View>

            <View
              style={[
                styles.swatchItem,
                {
                  backgroundColor: palette.primaryBrown,
                  borderColor: palette.primaryBrownDark,
                },
              ]}
            >
              <Text style={[styles.swatchLabel, { color: palette.textOnPrimary }]}>
                Primary
              </Text>
              <Text style={[styles.swatchHex, { color: palette.surfaceBeige }]}>
                {palette.primaryBrown}
              </Text>
            </View>

            <View
              style={[
                styles.swatchItem,
                {
                  backgroundColor: palette.receiveSageTint,
                  borderColor: palette.receiveSageGreen,
                },
              ]}
            >
              <Text
                style={[
                  styles.swatchLabel,
                  { color: palette.receiveSageGreen },
                ]}
              >
                Will Get
              </Text>
              <Text
                style={[styles.swatchHex, { color: palette.receiveSageGreen }]}
              >
                {palette.receiveSageGreen}
              </Text>
            </View>

            <View
              style={[
                styles.swatchItem,
                {
                  backgroundColor: palette.giveTerracottaTint,
                  borderColor: palette.giveTerracottaRed,
                },
              ]}
            >
              <Text
                style={[
                  styles.swatchLabel,
                  { color: palette.giveTerracottaRed },
                ]}
              >
                Will Give
              </Text>
              <Text
                style={[styles.swatchHex, { color: palette.giveTerracottaRed }]}
              >
                {palette.giveTerracottaRed}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Bar with Center Floating 🎙️ Mic Button */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: palette.surfaceBeige,
            borderTopColor: palette.borderLatte,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => setActiveTab('HOME')}
          style={styles.tabItem}
        >
          <Text
            style={[
              styles.tabLabel,
              {
                color:
                  activeTab === 'HOME'
                    ? palette.primaryBrown
                    : palette.textMocha,
              },
            ]}
          >
            🏠 Home
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('UDHAAR')}
          style={styles.tabItem}
        >
          <Text
            style={[
              styles.tabLabel,
              {
                color:
                  activeTab === 'UDHAAR'
                    ? palette.primaryBrown
                    : palette.textMocha,
              },
            ]}
          >
            📒 Udhaar
          </Text>
        </TouchableOpacity>

        {/* Center Floating Voice Mic Button */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={[
            styles.micButton,
            {
              backgroundColor: palette.primaryBrown,
              borderColor: palette.backgroundCream,
            },
          ]}
        >
          <Text style={styles.micIcon}>🎙️</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('DRAFTS')}
          style={styles.tabItem}
        >
          <Text
            style={[
              styles.tabLabel,
              {
                color:
                  activeTab === 'DRAFTS'
                    ? palette.primaryBrown
                    : palette.textMocha,
              },
            ]}
          >
            📥 Drafts
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('SETTINGS')}
          style={styles.tabItem}
        >
          <Text
            style={[
              styles.tabLabel,
              {
                color:
                  activeTab === 'SETTINGS'
                    ? palette.primaryBrown
                    : palette.textMocha,
              },
            ]}
          >
            ⚙️ Settings
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
    gap: 16,
  },
  heroCard: {
    borderRadius: 18,
    padding: 18,
  },
  heroTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  heroSubtitle: {
    fontSize: 13,
    marginTop: 4,
    opacity: 0.92,
  },
  workspaceIdRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(250, 246, 240, 0.2)',
  },
  workspaceIdText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sectionCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  sectionDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  mathBox: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    gap: 8,
  },
  mathRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mathLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  mathValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  mathDivider: {
    height: 1,
    marginVertical: 4,
  },
  mathLabelBold: {
    fontSize: 13,
    fontWeight: '800',
  },
  mathValueBold: {
    fontSize: 14,
    fontWeight: '800',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  chipBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  swatchItem: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  swatchLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  swatchHex: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: '600',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 64,
    borderTopWidth: 1,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  micButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginTop: -24,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  micIcon: {
    fontSize: 24,
  },
});

