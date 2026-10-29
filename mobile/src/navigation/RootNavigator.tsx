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
import { HeaderModeSwitcher } from '../components/HeaderModeSwitcher';
import { VoiceAssistantSheet } from '../components/VoiceAssistantSheet';
import { AuthScreen } from '../screens/AuthScreen';
import { PersonalDashboardScreen } from '../screens/PersonalDashboardScreen';
import { BusinessDashboardScreen } from '../screens/BusinessDashboardScreen';
import { CustomerDetailScreen } from '../screens/CustomerDetailScreen';
import { SkeletonLoader, ErrorRetryCard } from '../components/QueryStateViews';

export type ActiveTab = 'HOME' | 'UDHAAR';

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
          ) : activeTab === 'UDHAAR' ? (
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
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color:
                      activeTab === 'HOME' ? palette.primaryBrown : '#64748B',
                    fontWeight: activeTab === 'HOME' ? '700' : '500',
                  },
                ]}
              >
                Home
              </Text>
            </TouchableOpacity>

            {/* Clean Center Voice Action Button */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setVoiceSheetVisible(true)}
              style={[
                styles.micButton,
                { backgroundColor: palette.primaryBrown },
              ]}
            >
              <Text style={styles.micLabel}>Voice</Text>
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
                      activeTab === 'UDHAAR' ? palette.primaryBrown : '#64748B',
                    fontWeight: activeTab === 'UDHAAR' ? '700' : '500',
                  },
                ]}
              >
                Udhaar
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
    backgroundColor: '#FFFFFF',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 58,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabLabel: {
    fontSize: 13,
  },
  micButton: {
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
