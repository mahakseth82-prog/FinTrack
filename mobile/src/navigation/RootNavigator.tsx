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
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: palette.backgroundCream },
      ]}
    >
      {!selectedContactId && <HeaderModeSwitcher />}

      <View style={styles.body}>
        {workspacesQuery.isLoading ? (
          <View style={{ padding: 16 }}>
            <SkeletonLoader count={3} height={110} />
          </View>
        ) : workspacesQuery.isError ? (
          <View style={{ padding: 16 }}>
            <ErrorRetryCard
              errorMessage={
                workspacesQuery.error instanceof Error
                  ? workspacesQuery.error.message
                  : 'Unable to load workspaces from FinTrack backend.'
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

      {/* AI Voice Assistant Bottom Sheet */}
      <VoiceAssistantSheet
        visible={voiceSheetVisible}
        initialDraft={selectedDraft}
        onClose={() => {
          setVoiceSheetVisible(false);
          setSelectedDraft(null);
        }}
      />

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
            onPress={() => {
              setSelectedDraft(null);
              setVoiceSheetVisible(true);
            }}
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
                      : palette.textMocha,
                },
              ]}
            >
              📷 Scan/UPI
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
