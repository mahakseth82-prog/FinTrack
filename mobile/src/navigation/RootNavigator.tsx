
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
  Animated,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
  useWorkspaces,
  useParseVoiceDraft,
} from '../hooks/useFinTrackQueries';
import { SYSTEM_FONT_STACK } from '../theme/colors';
import { MinimalIcon } from '../components/MinimalIcon';
import { HeaderModeSwitcher } from '../components/HeaderModeSwitcher';
import { AuthScreen } from '../screens/AuthScreen';
import { PersonalDashboardScreen } from '../screens/PersonalDashboardScreen';
import { BusinessDashboardScreen } from '../screens/BusinessDashboardScreen';
import { CustomerDetailScreen } from '../screens/CustomerDetailScreen';
import { SkeletonLoader, ErrorRetryCard } from '../components/QueryStateViews';

export type ActiveTab = 'HOME' | 'LEDGER';

export const RootNavigator: React.FC = () => {
  const { user } = useAuth();
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
    setVoiceStatusType('SAVING');
    setVoiceStatusMsg('Saving to transactions...');

    try {
      const res = await parseVoiceMutation.mutateAsync({
        utteranceText: params.text,
        audioBase64: params.audioBase64,
        audioMimeType: params.audioMimeType,
        autoSave: true,
      });

      setVoiceStatusType('SUCCESS');
      const s = res.savedSummary;
      const sign =
        s?.intent === 'INCOME' || s?.intent === 'UDHAAR_REPAYMENT' ? '+' : '-';
      setVoiceStatusMsg(
        `✓ Saved: ${s?.title || 'Entry'} (${sign}${s?.amountFormatted || ''})`
      );

      setTimeout(() => {
        setVoiceStatusMsg(null);
      }, 2500);
    } catch (err: unknown) {
      setVoiceStatusType('ERROR');
      const msg = err instanceof Error ? err.message : 'Could not save entry';
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
   * Directly starts recording the instant the central mic button is clicked.
   * No intermediate modals, popups, or confirmation screens.
   */
  const startRecording = async () => {
    latestTranscriptRef.current = '';
    setVoiceStatusType('LISTENING');
    setVoiceStatusMsg('Listening... Speak now');

    // 1. Browser Web Speech Recognition (Chrome / Android Browser)
    if (Platform.OS === 'web') {
      const webGlobal = globalThis as any;
      const SpeechRecognition =
        webGlobal.SpeechRecognition || webGlobal.webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.lang = 'en-IN'; // Indian English / Hinglish
          recognition.continuous = false;
          recognition.interimResults = true;

          recognition.onstart = () => {
            setIsRecording(true);
            setVoiceStatusType('LISTENING');
            setVoiceStatusMsg('Listening... Speak now');
          };

          recognition.onresult = (event: any) => {
            let transcript = '';
            for (let i = 0; i < event.results.length; i++) {
              transcript += (event.results[i][0].transcript || '') + ' ';
            }
            const trimmed = transcript.replace(/\s+/g, ' ').trim();
            latestTranscriptRef.current = trimmed;
            setVoiceStatusMsg(`"${trimmed}" (tap to save)`);

            // Auto-save after 1.8 seconds of natural silence pause
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
          // Fall through to native recording
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
      setVoiceStatusMsg('Listening... Tap mic when done');
    } catch (err: unknown) {
      setIsRecording(false);
      setVoiceStatusType('ERROR');
      setVoiceStatusMsg('Could not open mic on device');
      setTimeout(() => setVoiceStatusMsg(null), 3000);
    }
  };

  /**
   * Toggles recording on/off directly from the single bottom mic button.
   */
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

        {/* Floating Non-Intrusive Voice Feedback Pill (Zero Modals / Full Screen Visible) */}
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

            {/* Central 1-Tap Mic Button: Starts recording right here with zero modal popups */}
            <View style={styles.voiceCenterSlot}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleMicTap}
              >
                <Animated.View
                  style={[
                    styles.voiceCircleBtn,
                    {
                      backgroundColor: isRecording
                        ? '#DC2626'
                        : palette.primaryBrown,
                      transform: [{ scale: pulseAnim }],
                    },
                  ]}
                >
                  <MinimalIcon
                    name="mic"
                    size={18}
                    color="#FFFFFF"
                  />
                </Animated.View>
              </TouchableOpacity>
              <Text
                style={[
                  styles.voiceLabel,
                  isRecording && { color: '#DC2626', fontWeight: '700' },
                ]}
              >
                {isRecording ? 'Listening' : 'Voice'}
              </Text>
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
  floatingPill: {
    position: 'absolute',
    bottom: 74,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    zIndex: 999,
    maxWidth: '90%',
  },
  pillListening: {
    backgroundColor: '#0F172A',
    borderColor: '#DC2626',
    borderWidth: 1,
  },
  pillSaving: {
    backgroundColor: '#312E81',
  },
  pillSuccess: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  pillError: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  pillText: {
    fontFamily: SYSTEM_FONT_STACK,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  pillTextSuccess: {
    color: '#15803D',
    fontWeight: '700',
  },
  pillTextError: {
    color: '#B91C1C',
    fontWeight: '700',
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
