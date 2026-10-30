import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFinTrackTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
  useWorkspaces,
  useParseVoiceDraft,
} from '../hooks/useFinTrackQueries';
import { SYSTEM_FONT_STACK, EMERALD_THEME } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { MinimalIcon } from '../components/MinimalIcon';
import { HeaderModeSwitcher } from '../components/HeaderModeSwitcher';
import { LanguagePreferenceModal } from '../components/LanguagePreferenceModal';
import { AuthScreen } from '../screens/AuthScreen';
import { PersonalDashboardScreen } from '../screens/PersonalDashboardScreen';
import { TransactionsScreen } from '../screens/TransactionsScreen';
import { InsightsScreen } from '../screens/InsightsScreen';
import { BusinessDashboardScreen } from '../screens/BusinessDashboardScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { CustomerDetailScreen } from '../screens/CustomerDetailScreen';
import { SkeletonLoader, ErrorRetryCard } from '../components/QueryStateViews';

export type ActiveTab = 'HOME' | 'TRANSACTIONS' | 'INSIGHTS' | 'UDHAAR' | 'PROFILE';

export const RootNavigator: React.FC = () => {
  const { user, hasSelectedLanguage } = useAuth();
  const { mode, palette, activeWorkspaceId, registerBackendWorkspaces } =
    useFinTrackTheme();
  const [activeTab, setActiveTab] = useState<ActiveTab>('HOME');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );

  // Direct 1-Tap Voice Recording State (Zero Popups / Zero Modals)
  const [isRecording, setIsRecording] = useState(false);
  const [voiceStatusMsg, setVoiceStatusMsg] = useState<string | null>(null);
  const [voiceStatusType, setVoiceStatusType] = useState<
    'LISTENING' | 'SAVING' | 'SUCCESS' | 'ERROR'
  >('LISTENING');

  const recRef = useRef<any>(null);
  const nativeRecorderRef = useRef<any>(null);
  const latestTranscriptRef = useRef<string>('');
  const silenceTimerRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const workspacesQuery = useWorkspaces();
  const parseVoiceMutation = useParseVoiceDraft(activeWorkspaceId);

  useEffect(() => {
    if (workspacesQuery.data?.workspaces) {
      registerBackendWorkspaces(workspacesQuery.data.workspaces);
    }
  }, [workspacesQuery.data]);

  // Pulsing animation while mic is actively recording
  useEffect(() => {
    if (!isRecording) {
      pulseAnim.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.95,
          duration: 400,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isRecording, pulseAnim]);

  /**
   * Submits the spoken text or recorded audio directly to FinTrack backend
   * with autoSave: true, then displays a subtle 2-second success pill.
   */
  const submitVoiceEntry = async (params: {
    text?: string;
    audioBase64?: string;
    audioMimeType?: string;
  }) => {
    const isHi = user?.preferredLanguage === 'hi';
    setVoiceStatusType('SAVING');
    setVoiceStatusMsg(isHi ? 'सहेजा जा रहा है...' : 'Saving to transactions...');

    try {
      const res = await parseVoiceMutation.mutateAsync({
        utteranceText: params.text,
        audioBase64: params.audioBase64,
        audioMimeType: params.audioMimeType,
        autoSave: true,
        preferredLanguage: user?.preferredLanguage,
      });

      setVoiceStatusType('SUCCESS');
      const s = res.savedSummary;
      const sign =
        s?.intent === 'INCOME' || s?.intent === 'UDHAAR_REPAYMENT' ? '+' : '-';
      setVoiceStatusMsg(
        isHi
          ? `✓ सहेजा गया: ${s?.title || 'खर्च'} (${sign}${s?.amountFormatted || ''})`
          : `✓ Saved: ${s?.title || 'Expense'} (${sign}${s?.amountFormatted || ''})`
      );

      setTimeout(() => {
        setVoiceStatusMsg(null);
      }, 2500);
    } catch (err: unknown) {
      setVoiceStatusType('ERROR');
      const msg = err instanceof Error ? err.message : (isHi ? 'एंट्री सहेजी नहीं जा सकी' : 'Could not save entry');
      setVoiceStatusMsg(`⚠️ ${msg}`);
      setTimeout(() => {
        setVoiceStatusMsg(null);
      }, 3000);
    }
  };

  /**
   * Stops active mic recording and sends the captured speech/audio to the backend.
   */
  const stopRecordingAndSave = async () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    // 1. Web SpeechRecognition Stop
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        // ignore
      }
      return;
    }

    // 2. Native Expo Audio Stop
    if (nativeRecorderRef.current) {
      setIsRecording(false);
      try {
        const recorder = nativeRecorderRef.current;
        nativeRecorderRef.current = null;
        await recorder.stop();
        const uri = recorder.uri;

        if (uri) {
          let base64 = '';
          try {
            const { File } = await import('expo-file-system');
            const file = new File(uri);
            base64 = await file.base64();
          } catch {
            try {
              const FileSystem = await import('expo-file-system/legacy');
              base64 = await FileSystem.readAsStringAsync(uri, {
                encoding: FileSystem.EncodingType.Base64,
              });
            } catch {
              const res = await fetch(uri);
              const blob = await res.blob();
              base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const r =
                    typeof reader.result === 'string' ? reader.result : '';
                  resolve(r.includes(',') ? r.split(',')[1] : r);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            }
          }

          if (base64) {
            await submitVoiceEntry({
              text: latestTranscriptRef.current.trim() || undefined,
              audioBase64: base64,
              audioMimeType: 'audio/m4a',
            });
          }
        }
      } catch (err: unknown) {
        console.error('Error processing audio recording:', err);
        setVoiceStatusType('ERROR');
        const msg =
          err instanceof Error ? err.message : 'Failed to process audio';
        setVoiceStatusMsg(msg);
        setTimeout(() => setVoiceStatusMsg(null), 3500);
      }
      return;
    }

    setIsRecording(false);
  };

  /**
   * Directly starts recording the instant the mic button is clicked.
   */
  const startRecording = async () => {
    const isHi = user?.preferredLanguage === 'hi';
    latestTranscriptRef.current = '';
    setVoiceStatusType('LISTENING');
    setVoiceStatusMsg(isHi ? 'सुन रहे हैं... बोलिए' : 'Listening... Speak now');

    // 1. Browser Web Speech Recognition
    if (Platform.OS === 'web') {
      const webGlobal = globalThis as any;
      const SpeechRecognition =
        webGlobal.SpeechRecognition || webGlobal.webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.lang = isHi ? 'hi-IN' : 'en-IN';
          recognition.continuous = false;
          recognition.interimResults = true;

          recognition.onstart = () => {
            setIsRecording(true);
            setVoiceStatusType('LISTENING');
            setVoiceStatusMsg(isHi ? 'सुन रहे हैं... बोलिए' : 'Listening... Speak now');
          };

          recognition.onresult = (event: any) => {
            let transcript = '';
            for (let i = 0; i < event.results.length; i++) {
              transcript += (event.results[i][0].transcript || '') + ' ';
            }
            const trimmed = transcript.replace(/\s+/g, ' ').trim();
            latestTranscriptRef.current = trimmed;
            setVoiceStatusMsg(`"${trimmed}"`);

            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
            }
            silenceTimerRef.current = setTimeout(() => {
              if (recRef.current) {
                try {
                  recRef.current.stop();
                } catch {
                  // ignore
                }
              }
            }, 1800);
          };

          recognition.onerror = (event: any) => {
            setIsRecording(false);
            if (event?.error === 'not-allowed') {
              setVoiceStatusType('ERROR');
              setVoiceStatusMsg('Microphone permission blocked');
              setTimeout(() => setVoiceStatusMsg(null), 3000);
            }
          };

          recognition.onend = () => {
            setIsRecording(false);
            recRef.current = null;
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
            const spoken = latestTranscriptRef.current.trim();
            if (spoken.length > 0) {
              void submitVoiceEntry({ text: spoken });
            } else {
              setVoiceStatusMsg(null);
            }
          };

          recRef.current = recognition;
          recognition.start();
          return;
        } catch {
          // Fall through
        }
      }
    }

    // 2. Native Mobile Recording (Expo Go)
    try {
      const expoAudio = await import('expo-audio');
      const perm = await expoAudio.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setVoiceStatusType('ERROR');
        setVoiceStatusMsg('Microphone permission required');
        setTimeout(() => setVoiceStatusMsg(null), 3000);
        return;
      }

      await expoAudio.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      const recorder = new expoAudio.AudioModule.AudioRecorder(
        expoAudio.RecordingPresets.HIGH_QUALITY
      );
      await recorder.prepareToRecordAsync();
      recorder.record();
      nativeRecorderRef.current = recorder;
      setIsRecording(true);
      setVoiceStatusType('LISTENING');
      setVoiceStatusMsg(isHi ? 'सुन रहे हैं... पूरा होने पर माइक दबाएं' : 'Listening... Tap mic when done');
    } catch (err: unknown) {
      setIsRecording(false);
      setVoiceStatusType('ERROR');
      setVoiceStatusMsg('Could not open mic on device');
      setTimeout(() => setVoiceStatusMsg(null), 3000);
    }
  };

  const handleMicTap = () => {
    if (isRecording) {
      void stopRecordingAndSave();
    } else {
      void startRecording();
    }
  };

  if (!user) {
    return <AuthScreen />;
  }

  const isHi = user.preferredLanguage === 'hi';

  return (
    <SafeAreaView style={styles.outerViewport}>
      {/* Strict Mobile Frame Enclosure */}
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
          ) : activeTab === 'TRANSACTIONS' ? (
            <TransactionsScreen />
          ) : activeTab === 'INSIGHTS' ? (
            <InsightsScreen />
          ) : activeTab === 'UDHAAR' ? (
            <BusinessDashboardScreen
              onOpenContactDetail={(id) => setSelectedContactId(id)}
            />
          ) : activeTab === 'PROFILE' ? (
            <ProfileScreen />
          ) : mode === 'PERSONAL' ? (
            <PersonalDashboardScreen
              onNavigateToTab={(t) => setActiveTab(t)}
              onOpenContactDetail={(id) => setSelectedContactId(id)}
            />
          ) : (
            <BusinessDashboardScreen
              onOpenContactDetail={(id) => setSelectedContactId(id)}
            />
          )}
        </View>

        {/* Floating Non-Intrusive Voice Feedback Pill */}
        {voiceStatusMsg && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={isRecording ? stopRecordingAndSave : undefined}
            style={[
              styles.floatingPill,
              voiceStatusType === 'SUCCESS' && styles.pillSuccess,
              voiceStatusType === 'ERROR' && styles.pillError,
              voiceStatusType === 'SAVING' && styles.pillSaving,
              voiceStatusType === 'LISTENING' && styles.pillListening,
            ]}
          >
            <Text
              style={[
                styles.pillText,
                voiceStatusType === 'SUCCESS' && styles.pillTextSuccess,
                voiceStatusType === 'ERROR' && styles.pillTextError,
              ]}
              numberOfLines={1}
            >
              {voiceStatusMsg}
            </Text>
          </TouchableOpacity>
        )}

        {/* Floating 1-Tap Mic Action Button (Non-blocking, always available) */}
        {!selectedContactId && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleMicTap}
            style={styles.floatingMicFab}
          >
            <Animated.View
              style={[
                styles.fabInnerCircle,
                {
                  backgroundColor: isRecording ? '#DC2626' : EMERALD_THEME.emeraldGreen,
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <Ionicons name="mic" size={24} color="#FFFFFF" />
            </Animated.View>
          </TouchableOpacity>
        )}

        {/* Bottom Navigation Bar: 5 Core Tabs [ Home | Transactions | Insights | Udhaar | Profile ] */}
        {!selectedContactId && (
          <View style={styles.bottomBar}>
            {/* Tab 1: Home */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveTab('HOME')}
              style={styles.tabItem}
            >
              <Ionicons
                name={activeTab === 'HOME' ? 'home' : 'home-outline'}
                size={20}
                color={activeTab === 'HOME' ? EMERALD_THEME.emeraldGreen : '#94A3B8'}
              />
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === 'HOME' && {
                    color: EMERALD_THEME.emeraldGreen,
                    fontWeight: '700',
                  },
                ]}
              >
                {isHi ? 'होम' : 'Home'}
              </Text>
            </TouchableOpacity>

            {/* Tab 2: Transactions */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveTab('TRANSACTIONS')}
              style={styles.tabItem}
            >
              <Ionicons
                name={activeTab === 'TRANSACTIONS' ? 'receipt' : 'receipt-outline'}
                size={20}
                color={activeTab === 'TRANSACTIONS' ? EMERALD_THEME.emeraldGreen : '#94A3B8'}
              />
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === 'TRANSACTIONS' && {
                    color: EMERALD_THEME.emeraldGreen,
                    fontWeight: '700',
                  },
                ]}
              >
                {isHi ? 'लेन-देन' : 'Transactions'}
              </Text>
            </TouchableOpacity>

            {/* Tab 3: Insights */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveTab('INSIGHTS')}
              style={styles.tabItem}
            >
              <Ionicons
                name={activeTab === 'INSIGHTS' ? 'bar-chart' : 'bar-chart-outline'}
                size={20}
                color={activeTab === 'INSIGHTS' ? EMERALD_THEME.emeraldGreen : '#94A3B8'}
              />
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === 'INSIGHTS' && {
                    color: EMERALD_THEME.emeraldGreen,
                    fontWeight: '700',
                  },
                ]}
              >
                {isHi ? 'एनालिटिक्स' : 'Insights'}
              </Text>
            </TouchableOpacity>

            {/* Tab 4: Udhaar */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveTab('UDHAAR')}
              style={styles.tabItem}
            >
              <Ionicons
                name={activeTab === 'UDHAAR' ? 'book' : 'book-outline'}
                size={20}
                color={activeTab === 'UDHAAR' ? EMERALD_THEME.emeraldGreen : '#94A3B8'}
              />
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === 'UDHAAR' && {
                    color: EMERALD_THEME.emeraldGreen,
                    fontWeight: '700',
                  },
                ]}
              >
                {isHi ? 'उधार खाता' : 'Udhaar'}
              </Text>
            </TouchableOpacity>

            {/* Tab 5: Profile */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveTab('PROFILE')}
              style={styles.tabItem}
            >
              <Ionicons
                name={activeTab === 'PROFILE' ? 'person' : 'person-outline'}
                size={20}
                color={activeTab === 'PROFILE' ? EMERALD_THEME.emeraldGreen : '#94A3B8'}
              />
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === 'PROFILE' && {
                    color: EMERALD_THEME.emeraldGreen,
                    fontWeight: '700',
                  },
                ]}
              >
                {isHi ? 'प्रोफ़ाइल' : 'Profile'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Mandatory Onboarding Language Selection Modal (Shown on First Login if not chosen) */}
        <LanguagePreferenceModal
          visible={!hasSelectedLanguage}
          mandatory={true}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  outerViewport: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mobileFrame: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  body: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  floatingPill: {
    position: 'absolute',
    bottom: 84,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  pillListening: {
    backgroundColor: '#0F172A',
  },
  pillSaving: {
    backgroundColor: '#059669',
  },
  pillSuccess: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  pillError: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: SYSTEM_FONT_STACK,
  },
  pillTextSuccess: {
    color: '#065F46',
  },
  pillTextError: {
    color: '#991B1B',
  },
  floatingMicFab: {
    position: 'absolute',
    bottom: 74,
    right: 20,
    zIndex: 100,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  fabInnerCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    height: 64,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  tabLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 3,
    fontWeight: '500',
  },
});
