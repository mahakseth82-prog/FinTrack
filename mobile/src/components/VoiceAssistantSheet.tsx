import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  Animated,
  StyleSheet,
  Platform,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import {
  useParseVoiceDraft,
  useClarifyDraft,
  useConfirmDraft,
  useDismissDraft,
} from '../hooks/useFinTrackQueries';
import { IngestionDraftDto } from '../types/ledger';

interface VoiceAssistantSheetProps {
  visible: boolean;
  initialDraft?: IngestionDraftDto | null;
  onClose: () => void;
}

/**
 * Helper to convert a recorded local file/blob URI into a Base64 string on both Web & Native.
 */
async function uriToBase64(
  uri: string
): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const mimeType =
    blob.type || (Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve({ base64, mimeType });
    };
    reader.onerror = () => reject(new Error('Failed to read audio recording'));
    reader.readAsDataURL(blob);
  });
}

export const VoiceAssistantSheet: React.FC<VoiceAssistantSheetProps> = ({
  visible,
  initialDraft = null,
  onClose,
}) => {
  const { activeWorkspaceId } = useFinTrackTheme();

  const parseVoiceMutation = useParseVoiceDraft(activeWorkspaceId);
  const clarifyMutation = useClarifyDraft(activeWorkspaceId);
  const confirmMutation = useConfirmDraft(activeWorkspaceId);
  const dismissMutation = useDismissDraft(activeWorkspaceId);

  const [currentDraft, setCurrentDraft] = useState<IngestionDraftDto | null>(
    initialDraft
  );
  const [utteranceInput, setUtteranceInput] = useState('');
  const [clarificationInput, setClarificationInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingObj, setRecordingObj] = useState<any>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const speechRecRef = useRef<any>(null);
  const latestTranscriptRef = useRef<string>('');
  const waveAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    setCurrentDraft(initialDraft);
    setSavedBanner(null);
    setErrorText(null);
  }, [initialDraft, visible]);

  useEffect(() => {
    if (!isRecording && !parseVoiceMutation.isPending) {
      waveAnim.setValue(0.35);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(waveAnim, {
          toValue: 0.3,
          duration: 350,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, parseVoiceMutation.isPending, waveAnim]);

  const handleResetAndClose = () => {
    if (speechRecRef.current) {
      try {
        speechRecRef.current.abort();
      } catch {
        // ignore
      }
      speechRecRef.current = null;
    }
    setCurrentDraft(null);
    setUtteranceInput('');
    setClarificationInput('');
    setErrorText(null);
    setSavedBanner(null);
    setIsRecording(false);
    onClose();
  };

  /**
   * Automatically parses and saves the spoken/typed entry directly into Passbook / Udhaar Khata.
   * No second page for merchant name, category, etc.
   */
  const submitAndAutoSave = async (params: {
    text?: string;
    audioBase64?: string;
    audioMimeType?: string;
  }) => {
    const cleanText = params.text?.trim() || '';
    if (!cleanText && !params.audioBase64) {
      setErrorText(
        'Please speak or type an entry (e.g. "Petrol 300" or "Ravi ko 500 udhaar")'
      );
      return;
    }

    setErrorText(null);
    try {
      const res = await parseVoiceMutation.mutateAsync({
        utteranceText: cleanText || undefined,
        audioBase64: params.audioBase64,
        audioMimeType: params.audioMimeType,
        autoSave: true,
      });

      if (res.autoSaved && res.savedSummary) {
        const s = res.savedSummary;
        const sign = s.intent === 'INCOME' || s.intent === 'UDHAAR_REPAYMENT' ? '+' : '-';
        setSavedBanner(
          `Saved: ${s.title} (${sign} ${s.amountFormatted} • ${s.paymentVia})`
        );
        setUtteranceInput('');
        latestTranscriptRef.current = '';
        setTimeout(() => {
          handleResetAndClose();
        }, 850);
        return;
      }

      // Only if no amount was mentioned at all (e.g., user just said "Petrol")
      if (res.draft.status === 'NEEDS_CLARIFICATION') {
        setCurrentDraft(res.draft);
      } else {
        // Fallback auto-confirm if draft has an amount
        await confirmMutation.mutateAsync({
          draftId: res.draft.id,
        });
        setSavedBanner('Entry saved to Passbook');
        setTimeout(() => {
          handleResetAndClose();
        }, 750);
      }
    } catch (err: unknown) {
      setErrorText(
        err instanceof Error ? err.message : 'Could not save voice entry'
      );
    }
  };

  /**
   * Starts microphone listening:
   * - On Web (Chrome/Edge): Uses browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`)
   *   with live Hindi/Hinglish/English transcription AND auto-saves as soon as you finish speaking.
   * - On Mobile / Fallback: Uses `expo-av` audio recording and sends Base64 audio to Gemini.
   */
  const startMicRecording = async () => {
    setErrorText(null);
    setSavedBanner(null);
    latestTranscriptRef.current = '';

    // 1. Web Browser Live Speech Recognition (Chrome / Edge / Android WebView)
    if (Platform.OS === 'web') {
      const webGlobal = globalThis as any;
      const SpeechRecognition =
        webGlobal.SpeechRecognition || webGlobal.webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.lang = 'hi-IN'; // Understands Hindi, Hinglish & Indian English
          recognition.continuous = false;
          recognition.interimResults = true;

          recognition.onstart = () => {
            setIsRecording(true);
          };

          recognition.onresult = (event: any) => {
            let transcript = '';
            for (let i = 0; i < event.results.length; i++) {
              transcript += event.results[i][0].transcript;
            }
            const trimmed = transcript.trim();
            latestTranscriptRef.current = trimmed;
            setUtteranceInput(trimmed);
          };

          recognition.onerror = (event: any) => {
            setIsRecording(false);
            if (event?.error === 'not-allowed') {
              setErrorText(
                'Microphone permission blocked in browser. Please allow microphone access in the address bar or type below.'
              );
            } else {
              setErrorText(
                'Could not hear clearly. Please try speaking again or type below.'
              );
            }
          };

          recognition.onend = () => {
            setIsRecording(false);
            speechRecRef.current = null;
            const spoken = latestTranscriptRef.current.trim();
            if (spoken.length > 0) {
              void submitAndAutoSave({ text: spoken });
            }
          };

          speechRecRef.current = recognition;
          recognition.start();
          return;
        } catch {
          // Fall through to expo-av recording if SpeechRecognition fails to initialize
        }
      }
    }

    // 2. Native Mobile (Expo Go) or Non-Chromium Browser Audio Recording
    try {
      const { Audio } = await import('expo-av');
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setErrorText(
          'Microphone permission not granted. Please allow microphone permission or type below.'
        );
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecordingObj(recording);
      setIsRecording(true);
    } catch (err: unknown) {
      setErrorText(
        err instanceof Error
          ? err.message
          : 'Could not start microphone on this device.'
      );
    }
  };

  const stopMicRecording = async () => {
    // If Web SpeechRecognition is active, stopping it triggers `onend` which auto-saves
    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        setIsRecording(false);
      }
      return;
    }

    if (!recordingObj) {
      setIsRecording(false);
      return;
    }

    setIsRecording(false);
    try {
      await recordingObj.stopAndUnloadAsync();
      const uri = recordingObj.getURI();
      setRecordingObj(null);

      if (uri) {
        const { base64, mimeType } = await uriToBase64(uri);
        await submitAndAutoSave({
          text: utteranceInput.trim() || undefined,
          audioBase64: base64,
          audioMimeType: mimeType,
        });
      } else if (utteranceInput.trim()) {
        await submitAndAutoSave({ text: utteranceInput.trim() });
      }
    } catch (err: unknown) {
      setRecordingObj(null);
      if (utteranceInput.trim()) {
        await submitAndAutoSave({ text: utteranceInput.trim() });
      } else {
        setErrorText(
          err instanceof Error ? err.message : 'Failed to process audio'
        );
      }
    }
  };

  const handleSendClarification = async () => {
    if (!currentDraft || !clarificationInput.trim()) return;
    setErrorText(null);
    try {
      const res = await clarifyMutation.mutateAsync({
        draftId: currentDraft.id,
        clarificationAnswer: clarificationInput.trim(),
      });
      setClarificationInput('');

      if (res.autoSaved && res.savedSummary) {
        const s = res.savedSummary;
        setSavedBanner(`Saved: ${s.title} (${s.amountFormatted})`);
        setTimeout(() => {
          handleResetAndClose();
        }, 800);
        return;
      }

      setCurrentDraft(res.draft);
    } catch (err: unknown) {
      setErrorText(
        err instanceof Error ? err.message : 'Failed to save entry'
      );
    }
  };

  const handleDismiss = async () => {
    if (!currentDraft) {
      handleResetAndClose();
      return;
    }
    try {
      await dismissMutation.mutateAsync(currentDraft.id);
      handleResetAndClose();
    } catch {
      handleResetAndClose();
    }
  };

  const isBusy =
    parseVoiceMutation.isPending ||
    clarifyMutation.isPending ||
    confirmMutation.isPending;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          {/* Clean Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.sheetTitle}>Quick Voice / Text Entry</Text>
              <Text style={styles.sheetSubtitle}>
                Speak or type — saves directly to Passbook
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleResetAndClose}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Auto-Saved Confirmation Banner */}
          {savedBanner && (
            <View style={styles.savedBannerBox}>
              <Text style={styles.savedBannerText}>{savedBanner}</Text>
            </View>
          )}

          {/* Main Input View */}
          {!currentDraft && (
            <View style={styles.bodyWrap}>
              {/* Clean Mic Control Box */}
              <View style={styles.micBox}>
                <View style={styles.waveBarsRow}>
                  {[0.6, 1.0, 0.8, 1.2, 0.9].map((mult, idx) => (
                    <Animated.View
                      key={idx}
                      style={[
                        styles.waveBar,
                        {
                          backgroundColor: isRecording ? '#B91C1C' : '#0F172A',
                          transform: [
                            {
                              scaleY: Animated.multiply(waveAnim, mult),
                            },
                          ],
                        },
                      ]}
                    />
                  ))}
                </View>

                <Text style={styles.micStatusText}>
                  {isRecording
                    ? 'Listening... Speak now (e.g. "Petrol 300" or "Ravi ko 500 udhaar")'
                    : isBusy
                      ? 'Saving entry to Passbook...'
                      : 'Tap Mic to speak, or type in a single line below'}
                </Text>

                <TouchableOpacity
                  onPress={isRecording ? stopMicRecording : startMicRecording}
                  disabled={isBusy}
                  style={[
                    styles.micButton,
                    isRecording && styles.micButtonRecording,
                  ]}
                >
                  <Text style={styles.micButtonText}>
                    {isRecording ? 'Stop & Save' : 'Tap to Speak'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Single-Line Quick Text Input (Auto-Saves Immediately) */}
              <Text style={styles.inputLabel}>
                Or write in one line (Auto-saves immediately):
              </Text>
              <TextInput
                value={utteranceInput}
                onChangeText={setUtteranceInput}
                placeholder='e.g. "DMart 450", "Petrol 300", "Ravi ko 2000 udhaar"'
                placeholderTextColor="#94A3B8"
                onSubmitEditing={() =>
                  submitAndAutoSave({ text: utteranceInput })
                }
                style={styles.textInput}
              />

              {/* Quick Example Pills for 1-Tap Testing */}
              <View style={styles.examplesRow}>
                {[
                  'Petrol 300',
                  'Chai & Snacks 120',
                  'Ravi ko 500 udhaar',
                ].map((sample) => (
                  <TouchableOpacity
                    key={sample}
                    onPress={() => setUtteranceInput(sample)}
                    style={styles.examplePill}
                  >
                    <Text style={styles.examplePillText}>{sample}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                onPress={() => submitAndAutoSave({ text: utteranceInput })}
                disabled={isBusy}
                style={[styles.saveBtn, isBusy && { opacity: 0.6 }]}
              >
                <Text style={styles.saveBtnText}>
                  {isBusy ? 'Saving to Passbook...' : 'Save Entry'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Only shown if the user didn't mention any rupee amount at all */}
          {currentDraft && currentDraft.status === 'NEEDS_CLARIFICATION' && (
            <View style={styles.clarifyBox}>
              <Text style={styles.clarifyYouSaid}>
                Entry: &ldquo;{currentDraft.rawInputText}&rdquo;
              </Text>
              <Text style={styles.clarifyQuestionText}>
                {currentDraft.ambiguityQuestion ||
                  'Please enter the amount in Rupees:'}
              </Text>

              <TextInput
                value={clarificationInput}
                onChangeText={setClarificationInput}
                keyboardType="numeric"
                placeholder="Enter amount (e.g. 300)"
                placeholderTextColor="#94A3B8"
                onSubmitEditing={handleSendClarification}
                style={styles.textInput}
              />

              <View style={styles.rowActions}>
                <TouchableOpacity
                  onPress={handleDismiss}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSendClarification}
                  disabled={clarifyMutation.isPending}
                  style={styles.confirmBtn}
                >
                  <Text style={styles.saveBtnText}>
                    {clarifyMutation.isPending ? 'Saving...' : 'Save Now'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {errorText && <Text style={styles.errorMsg}>{errorText}</Text>}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheetContainer: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 13,
  },
  savedBannerBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  savedBannerText: {
    color: '#15803D',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  bodyWrap: {
    gap: 10,
  },
  micBox: {
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    gap: 10,
  },
  waveBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 32,
  },
  waveBar: {
    width: 5,
    height: 24,
    borderRadius: 3,
  },
  micStatusText: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
  },
  micButton: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#0F172A',
  },
  micButtonRecording: {
    backgroundColor: '#B91C1C',
  },
  micButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginTop: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  examplesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  examplePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  examplePillText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  clarifyBox: {
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    gap: 10,
  },
  clarifyYouSaid: {
    fontSize: 12,
    color: '#64748B',
  },
  clarifyQuestionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  rowActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 13,
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    alignItems: 'center',
  },
  errorMsg: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B91C1C',
    textAlign: 'center',
    marginTop: 10,
  },
});
