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
import { IngestionDraftDto } from '../types/ledger';
import { HeaderModeSwitcher } from '../components/HeaderModeSwitcher';
import { VoiceAssistantSheet } from '../components/VoiceAssistantSheet';
import { AuthScreen } from '../screens/AuthScreen';
import { PersonalDashboardScreen } from '../screens/PersonalDashboardScreen';
import { BusinessDashboardScreen } from '../screens/BusinessDashboardScreen';
import { CustomerDetailScreen } from '../screens/CustomerDetailScreen';
import { DraftsScreen } from '../screens/DraftsScreen';
import { ScannerAndUpiScreen } from '../screens/ScannerAndUpiScreen';
import { SkeletonLoader, ErrorRetryCard } from '../components/QueryStateViews';

export type ActiveTab = 'HOME' | 'UDHAAR' | 'DRAFTS' | 'SCANNER';

export const RootNavigator: React.FC = () => {
  const { user } = useAuth();
  const { mode, palette, registerBackendWorkspaces } = useFinTrackTheme();
  const [activeTab, setActiveTab] = useState<ActiveTab>('HOME');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );
  const [voiceSheetVisible, setVoiceSheetVisible] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<IngestionDraftDto | null>(
    null
  );

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
          ) : activeTab === 'DRAFTS' ? (
            <DraftsScreen
              onSelectDraftForReview={(draft) => {
                setSelectedDraft(draft);
                setVoiceSheetVisible(true);
              }}
              onOpenVoiceSheet={() => {
                setSelectedDraft(null);
                setVoiceSheetVisible(true);
              }}
            />
          ) : activeTab === 'SCANNER' ? (
            <ScannerAndUpiScreen
              onOpenDraftForConfirmation={(draft) => {
                setSelectedDraft(draft);
                setVoiceSheetVisible(true);
              }}
            />
          ) : activeTab === 'UDHAAR' ? (
            <BusinessDashboardScreen
              onOpenContactDetail={(id) => setSelectedContactId(id)}
            />
          ) : mode === 'PERSONAL' ? (
            <PersonalDashboardScreen
              onOpenContactDetail={(id) => setSelectedContactId(id)}
              onOpenDraftsTab={() => setActiveTab('DRAFTS')}
            />
          ) : (
            <BusinessDashboardScreen
              onOpenContactDetail={(id) => setSelectedContactId(id)}
            />
          )}
        </View>

        <VoiceAssistantSheet
          visible={voiceSheetVisible}
          initialDraft={selectedDraft}
          onClose={() => {
            setVoiceSheetVisible(false);
            setSelectedDraft(null);
          }}
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

            {/* Clean Center Voice Action Button */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {
                setSelectedDraft(null);
                setVoiceSheetVisible(true);
              }}
              style={[
                styles.micButton,
                { backgroundColor: palette.primaryBrown },
              ]}
            >
              <Text style={styles.micLabel}>Voice</Text>
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
                      activeTab === 'DRAFTS' ? palette.primaryBrown : '#64748B',
                    fontWeight: activeTab === 'DRAFTS' ? '700' : '500',
                  },
                ]}
              >
                Drafts
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab('SCANNER')}
              style={styles.tabItem}
            >
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color:
                      activeTab === 'SCANNER'
                        ? palette.primaryBrown
                        : '#64748B',
                    fontWeight: activeTab === 'SCANNER' ? '700' : '500',
                  },
                ]}
              >
                Scan / UPI
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
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabLabel: {
    fontSize: 12,
  },
  micButton: {
    paddingHorizontal: 16,
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
