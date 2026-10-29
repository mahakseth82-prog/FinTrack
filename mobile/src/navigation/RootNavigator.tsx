import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { ContactLedgerItem } from '../context/LedgerContext';
import { HeaderModeSwitcher } from '../components/HeaderModeSwitcher';
import { AuthScreen } from '../screens/AuthScreen';
import { PersonalDashboardScreen } from '../screens/PersonalDashboardScreen';
import { BusinessDashboardScreen } from '../screens/BusinessDashboardScreen';
import { CustomerDetailScreen } from '../screens/CustomerDetailScreen';

export type ActiveTab = 'HOME' | 'UDHAAR' | 'DRAFTS' | 'SETTINGS';

export const RootNavigator: React.FC = () => {
  const { user } = useAuth();
  const { mode, palette } = useFinTrackTheme();
  const [activeTab, setActiveTab] = useState<ActiveTab>('HOME');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );

  if (!user) {
    return <AuthScreen />;
  }

  const handleOpenContactDetail = (contact: ContactLedgerItem) => {
    setSelectedContactId(contact.id);
  };

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: palette.backgroundCream },
      ]}
    >
      {/* Top Mode Switcher Header (Hidden when inside full-screen Customer Chat Timeline) */}
      {!selectedContactId && <HeaderModeSwitcher />}

      {/* Main Screen Router */}
      <View style={styles.body}>
        {selectedContactId ? (
          <CustomerDetailScreen
            contactId={selectedContactId}
            onBack={() => setSelectedContactId(null)}
          />
        ) : activeTab === 'UDHAAR' ? (
          <BusinessDashboardScreen
            onOpenContactDetail={handleOpenContactDetail}
          />
        ) : mode === 'PERSONAL' ? (
          <PersonalDashboardScreen
            onOpenContactDetail={handleOpenContactDetail}
            onOpenDraftsTab={() => setActiveTab('DRAFTS')}
          />
        ) : (
          <BusinessDashboardScreen
            onOpenContactDetail={handleOpenContactDetail}
          />
        )}
      </View>

      {/* Bottom Bar with Center Floating 🎙️ Mic Button */}
      {!selectedContactId && (
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
              📒 Udhaar Khata
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
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  body: {
    flex: 1,
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
