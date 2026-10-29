
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useWorkspaces } from '../hooks/useFinTrackQueries';
import { SYSTEM_FONT_STACK } from '../theme/colors';
import { MinimalIcon } from '../components/MinimalIcon';
import { HeaderModeSwitcher } from '../components/HeaderModeSwitcher';
import { VoiceAssistantSheet } from '../components/VoiceAssistantSheet';
import { AuthScreen } from '../screens/AuthScreen';
import { PersonalDashboardScreen } from '../screens/PersonalDashboardScreen';
import { BusinessDashboardScreen } from '../screens/BusinessDashboardScreen';
import { CustomerDetailScreen } from '../screens/CustomerDetailScreen';
import { SkeletonLoader, ErrorRetryCard } from '../components/QueryStateViews';

export type ActiveTab = 'HOME' | 'LEDGER';

export const RootNavigator: React.FC = () => {
  const { user } = useAuth();
  const { mode, palette, registerBackendWorkspaces } = useFinTrackTheme();
  const [activeTab, setActiveTab] = useState<ActiveTab>('HOME');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );
  const [voiceSheetVisible, setVoiceSheetVisible] = useState(false);

  const workspacesQuery = useWorkspaces();

  useEffect(() => {
    if (workspacesQuery.data?.workspaces) {
      registerBackendWorkspaces(workspacesQuery.data.workspaces);
    }
  }, [workspacesQuery.data]);

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <SafeAreaView style={styles.outerViewport}>
      {/* Strict 440px Mobile Viewport Enclosure */}
      <View style={styles.mobileFrame}>
        {!selectedContactId && <HeaderModeSwitcher />}

        <View style={styles.body}>
          {workspacesQuery.isLoading ? (
            <View style={{ padding: 16 }}>
              <SkeletonLoader count={3} height={90} />
            </View>
          ) : workspacesQuery.isError ? (
            <View style={{ padding: 16 }}>
              <ErrorRetryCard
                errorMessage={
                  workspacesQuery.error instanceof Error
                    ? workspacesQuery.error.message
                    : 'Unable to load workspaces from FinTrack server.'
                }
                onRetry={() => workspacesQuery.refetch()}
              />
            </View>
          ) : selectedContactId ? (
            <CustomerDetailScreen
              contactId={selectedContactId}
              onBack={() => setSelectedContactId(null)}
            />
          ) : activeTab === 'LEDGER' ? (
            <BusinessDashboardScreen
              onOpenContactDetail={(id) => setSelectedContactId(id)}
            />
          ) : mode === 'PERSONAL' ? (
            <PersonalDashboardScreen
              onOpenContactDetail={(id) => setSelectedContactId(id)}
            />
          ) : (
            <BusinessDashboardScreen
              onOpenContactDetail={(id) => setSelectedContactId(id)}
            />
          )}
        </View>

        <VoiceAssistantSheet
          visible={voiceSheetVisible}
          initialDraft={null}
          onClose={() => setVoiceSheetVisible(false)}
        />

        {!selectedContactId && (
          <View style={styles.bottomBar}>
            <TouchableOpacity
              onPress={() => setActiveTab('HOME')}
              style={styles.tabItem}
            >
              <MinimalIcon
                name="home"
                size={18}
                color={activeTab === 'HOME' ? palette.primaryBrown : '#94A3B8'}
              />
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color:
                      activeTab === 'HOME' ? palette.primaryBrown : '#64748B',
                    fontWeight: activeTab === 'HOME' ? '600' : '500',
                  },
                ]}
              >
                Home
              </Text>
            </TouchableOpacity>

            {/* Central Sleek Circular Voice Action Button with Clean Microphone Glyph */}
            <View style={styles.voiceCenterSlot}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setVoiceSheetVisible(true)}
                style={[
                  styles.voiceCircleBtn,
                  { backgroundColor: palette.primaryBrown },
                ]}
              >
                <MinimalIcon name="mic" size={18} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.voiceLabel}>Voice</Text>
            </View>

            <TouchableOpacity
              onPress={() => setActiveTab('LEDGER')}
              style={styles.tabItem}
            >
              <MinimalIcon
                name="ledger"
                size={18}
                color={
                  activeTab === 'LEDGER' ? palette.primaryBrown : '#94A3B8'
                }
              />
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color:
                      activeTab === 'LEDGER' ? palette.primaryBrown : '#64748B',
                    fontWeight: activeTab === 'LEDGER' ? '600' : '500',
                  },
                ]}
              >
                Ledger
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  outerViewport: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  mobileFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#E2E8F0',
  },
  body: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 64,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 6,
  },
  tabLabel: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 11,
  },
  voiceCenterSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  voiceCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  voiceLabel: {
    fontFamily: SYSTEM_FONT_STACK,
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
});
