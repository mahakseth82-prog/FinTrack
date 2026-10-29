import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  Animated,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Audio } from 'expo-av';
import { useFinTrackTheme } from '../context/ThemeContext';
import {
  useParseVoiceDraft,
  useClarifyDraft,
  useConfirmDraft,
  useDismissDraft,
} from '../hooks/useFinTrackQueries';
import {
  IngestionDraftDto,
  DraftIntent,
  PaymentChannel,
} from '../types/ledger';
import { formatINR, rupeesToPaise } from '../utils/paise';

interface VoiceAssistantSheetProps {
  visible: boolean;
  initialDraft?: IngestionDraftDto | null;
  onClose: () => void;
}

export const VoiceAssistantSheet: React.FC<VoiceAssistantSheetProps> = ({
  visible,
  initialDraft = null,
  onClose,
}) => {
  const { palette, activeWorkspaceId } = useFinTrackTheme();

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
  const [recordingObj, setRecordingObj] = useState<Audio.Recording | null>(
    null
  );
  const [errorText, setErrorText] = useState<string | null>(null);

  // Editable confirmation fields
  const [editIntent, setEditIntent] = useState<DraftIntent>('EXPENSE');
  const [editAmountRupees, setEditAmountRupees] = useState('');
  const [editContactName, setEditContactName] = useState('');
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPaymentVia, setEditPaymentVia] = useState<PaymentChannel>('UPI');
  const [editDescription, setEditDescription] = useState('');

  // Animated 5-bar waveform for listening state
  const waveAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    setCurrentDraft(initialDraft);
    if (initialDraft) {
      hydrateEditableFields(initialDraft);
    }
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
          duration: 380,
          useNativeDriver: true,
        }),
        Animated.timing(waveAnim, {
          toValue: 0.3,
          duration: 380,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, parseVoiceMutation.isPending, waveAnim]);

  const hydrateEditableFields = (draft: IngestionDraftDto) => {
    setEditIntent(draft.intent);
    setEditAmountRupees(
      draft.extractedAmountRupees !== null
        ? String(draft.extractedAmountRupees)
        : ''
    );
    setEditContactName(draft.extractedContactName || '');
    setEditCategoryName(draft.extractedCategoryName || 'General');
    setEditDueDate(draft.extractedDueDate || '');
    setEditPaymentVia(draft.paymentVia || 'UPI');
    setEditDescription(draft.description || draft.rawInputText || '');
  };

  const handleResetAndClose = () => {
    setCurrentDraft(null);
    setUtteranceInput('');
    setClarificationInput('');
    setErrorText(null);
    setIsRecording(false);
    onClose();
  };

  const startMicRecording = async () => {
    try {
      setErrorText(null);
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setErrorText(
          'Microphone permission not granted. You can also type your Hindi/Hinglish voice command below.'
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
    if (!recordingObj) return;
    setIsRecording(false);
    try {
      await recordingObj.stopAndUnloadAsync();
      const uri = recordingObj.getURI();
      setRecordingObj(null);
      if (uri && utteranceInput.trim().length > 0) {
        await handleSendUtterance();
      } else {
        setErrorText(
          'Audio captured! Please confirm or enter your spoken Hindi/Hinglish text below to send to Gemini.'
        );
      }
    } catch {
      setRecordingObj(null);
    }
  };

  const handleSendUtterance = async () => {
    if (!utteranceInput.trim()) {
      setErrorText(
        'Kripya kuch bolein ya likhein (e.g. "Ravi ko 2000 rupaye udhaar diye, woh 10 November ko wapas karega")'
      );
      return;
    }
    setErrorText(null);
    try {
      const res = await parseVoiceMutation.mutateAsync({
        utteranceText: utteranceInput.trim(),
      });
      setCurrentDraft(res.draft);
      hydrateEditableFields(res.draft);
    } catch (err: unknown) {
      setErrorText(
        err instanceof Error ? err.message : 'Failed to parse voice with Gemini'
      );
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
      setCurrentDraft(res.draft);
      hydrateEditableFields(res.draft);
    } catch (err: unknown) {
      setErrorText(
        err instanceof Error ? err.message : 'Failed to clarify draft'
      );
    }
  };

  const handleConfirmAndSave = async () => {
    if (!currentDraft) return;
    if (!editAmountRupees.trim() || Number(editAmountRupees) <= 0) {
      setErrorText('Please enter a valid amount in Rupees before confirming.');
      return;
    }
    setErrorText(null);
    try {
      await confirmMutation.mutateAsync({
        draftId: currentDraft.id,
        intent: editIntent,
        amountRupees: editAmountRupees.trim(),
        contactName: editContactName.trim(),
        categoryName: editCategoryName.trim(),
        dueDate: editDueDate.trim() || undefined,
        paymentVia: editPaymentVia,
        description: editDescription.trim(),
      });
      handleResetAndClose();
    } catch (err: unknown) {
      setErrorText(
        err instanceof Error ? err.message : 'Failed to confirm & save draft'
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
    } catch (err: unknown) {
      setErrorText(
        err instanceof Error ? err.message : 'Failed to dismiss draft'
      );
    }
  };

  let previewPaise = 0;
  try {
    if (editAmountRupees.trim()) {
      previewPaise = rupeesToPaise(editAmountRupees.trim());
    }
  } catch {
    previewPaise = 0;
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: palette.surfaceBeige,
              borderColor: palette.borderLatte,
            },
          ]}
        >
          {/* Sheet Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.sheetTag, { color: palette.accentWarm }]}>
                🎙️ FINTRACK AI VOICE ASSISTANT (GEMINI)
              </Text>
              <Text style={[styles.sheetTitle, { color: palette.textEspresso }]}>
                {!currentDraft
                  ? 'Bol Kar Hisaab Likhein'
                  : currentDraft.status === 'NEEDS_CLARIFICATION'
                    ? '🤔 Chota Sa Sawal (Clarification)'
                    : '✅ Draft Transaction Card'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleResetAndClose}
              style={[
                styles.closeBtn,
                {
                  backgroundColor: palette.backgroundCream,
                  borderColor: palette.borderLatte,
                },
              ]}
            >
              <Text style={{ color: palette.textEspresso, fontWeight: '800' }}>
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
          >
            {/* STEP 1: SPEAK OR TYPE HINDI / HINGLISH / ENGLISH */}
            {!currentDraft && (
              <>
                <View
                  style={[
                    styles.waveformCard,
                    {
                      backgroundColor: palette.backgroundCream,
                      borderColor: palette.borderLatte,
                    },
                  ]}
                >
                  <View style={styles.waveBarsRow}>
                    {[0.6, 1.0, 0.8, 1.2, 0.9, 1.1, 0.7].map((mult, idx) => (
                      <Animated.View
                        key={idx}
                        style={[
                          styles.waveBar,
                          {
                            backgroundColor: isRecording
                              ? palette.giveTerracottaRed
                              : palette.primaryBrown,
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

                  <Text
                    style={[styles.waveHint, { color: palette.textMocha }]}
                  >
                    {isRecording
                      ? '🔴 Sun Raha Hoon... Speak in Hindi, Hinglish, or English'
                      : parseVoiceMutation.isPending
                        ? '🤖 Gemini AI is extracting draft...'
                        : 'Tap Mic or enter spoken Hindi / Hinglish below'}
                  </Text>

                  <TouchableOpacity
                    onPress={
                      isRecording ? stopMicRecording : startMicRecording
                    }
                    style={[
                      styles.recordCircleBtn,
                      {
                        backgroundColor: isRecording
                          ? palette.giveTerracottaRed
                          : palette.primaryBrown,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: palette.textOnPrimary,
                        fontWeight: '800',
                        fontSize: 13,
                      }}
                    >
                      {isRecording ? '⏹️ Stop Recording' : '🎙️ Hold / Tap Mic'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.label, { color: palette.textEspresso }]}>
                  Spoken Hindi / Hinglish / English Input:
                </Text>
                <TextInput
                  value={utteranceInput}
                  onChangeText={setUtteranceInput}
                  multiline
                  placeholder='e.g. "Ravi ko 2,000 rupaye udhaar diye, woh 10 November ko wapas karega"'
                  placeholderTextColor={palette.textMocha}
                  style={[
                    styles.textArea,
                    {
                      backgroundColor: palette.surfaceElevated,
                      borderColor: palette.borderLatte,
                      color: palette.textEspresso,
                    },
                  ]}
                />

                <TouchableOpacity
                  onPress={handleSendUtterance}
                  disabled={parseVoiceMutation.isPending}
                  style={[
                    styles.primaryActionBtn,
                    { backgroundColor: palette.primaryBrown },
                  ]}
                >
                  <Text
                    style={{
                      color: palette.textOnPrimary,
                      fontWeight: '800',
                      fontSize: 14,
                    }}
                  >
                    {parseVoiceMutation.isPending
                      ? '🤖 Extracting Draft via Gemini...'
                      : '✨ Create AI Draft →'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* STEP 2: AMBIGUITY FOLLOW-UP QUESTION */}
            {currentDraft &&
              currentDraft.status === 'NEEDS_CLARIFICATION' && (
                <View
                  style={[
                    styles.clarifyBox,
                    {
                      backgroundColor: palette.warningAmberTint,
                      borderColor: palette.accentWarm,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.clarifyBadge,
                      { color: palette.warningAmber },
                    ]}
                  >
                    🤖 AI FOLLOW-UP QUESTION
                  </Text>
                  <Text
                    style={[
                      styles.clarifyYouSaid,
                      { color: palette.textMocha },
                    ]}
                  >
                    You said: &ldquo;{currentDraft.rawInputText}&rdquo;
                  </Text>
                  <Text
                    style={[
                      styles.clarifyQuestionText,
                      { color: palette.textEspresso },
                    ]}
                  >
                    {currentDraft.ambiguityQuestion}
                  </Text>

                  <TextInput
                    value={clarificationInput}
                    onChangeText={setClarificationInput}
                    placeholder="Apna jawab likhein (e.g. Udhaar diye hain 15 Nov tak)"
                    placeholderTextColor={palette.textMocha}
                    style={[
                      styles.input,
                      {
                        backgroundColor: palette.surfaceElevated,
                        borderColor: palette.borderLatte,
                        color: palette.textEspresso,
                        marginTop: 10,
                      },
                    ]}
                  />

                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      onPress={handleDismiss}
                      style={[
                        styles.secondaryBtn,
                        { borderColor: palette.borderLatte },
                      ]}
                    >
                      <Text
                        style={{ color: palette.textMocha, fontWeight: '700' }}
                      >
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSendClarification}
                      disabled={clarifyMutation.isPending}
                      style={[
                        styles.confirmBtn,
                        { backgroundColor: palette.primaryBrown },
                      ]}
                    >
                      <Text
                        style={{
                          color: palette.textOnPrimary,
                          fontWeight: '800',
                        }}
                      >
                        {clarifyMutation.isPending
                          ? 'Updating Draft...'
                          : 'Reply to AI →'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

            {/* STEP 3: EDITABLE DRAFT TRANSACTION CARD (Golden Rule #1) */}
            {currentDraft &&
              currentDraft.status === 'PENDING_CONFIRMATION' && (
                <View
                  style={[
                    styles.draftCard,
                    {
                      backgroundColor: palette.backgroundCream,
                      borderColor: palette.borderLatte,
                    },
                  ]}
                >
                  <View style={styles.draftTopBadgeRow}>
                    <Text
                      style={[
                        styles.draftSourceTag,
                        { color: palette.primaryBrown },
                      ]}
                    >
                      🎙️ {currentDraft.source} DRAFT •{' '}
                      {Math.round(currentDraft.aiConfidence * 100)}% AI Match
                    </Text>
                    <Text
                      style={[
                        styles.paisePreviewTag,
                        { color: palette.receiveSageGreen },
                      ]}
                    >
                      {previewPaise > 0
                        ? `${formatINR(previewPaise)} (${previewPaise} paise)`
                        : 'Enter Amount'}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.transcriptQuote,
                      { color: palette.textMocha },
                    ]}
                  >
                    &ldquo;{currentDraft.rawInputText}&rdquo;
                  </Text>

                  {/* Intent Selector Chips */}
                  <Text
                    style={[styles.label, { color: palette.textEspresso }]}
                  >
                    Entry Type (Intent)
                  </Text>
                  <View style={styles.intentChipsWrap}>
                    {(
                      [
                        { id: 'UDHAAR_GAVE', label: '🔴 Udhaar Diya' },
                        { id: 'UDHAAR_REPAYMENT', label: '🟢 Wapas Mila' },
                        { id: 'UDHAAR_GOT', label: '🟠 Udhaar Liya' },
                        { id: 'EXPENSE', label: '💸 Kharcha' },
                        { id: 'INCOME', label: '💰 Kamaai' },
                      ] as { id: DraftIntent; label: string }[]
                    ).map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        onPress={() => setEditIntent(item.id)}
                        style={[
                          styles.intentChip,
                          {
                            backgroundColor:
                              editIntent === item.id
                                ? palette.primaryBrown
                                : palette.surfaceBeige,
                            borderColor: palette.borderLatte,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '700',
                            color:
                              editIntent === item.id
                                ? palette.textOnPrimary
                                : palette.textEspresso,
                          }}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text
                    style={[styles.label, { color: palette.textEspresso }]}
                  >
                    Amount (in ₹ Rupees)
                  </Text>
                  <TextInput
                    value={editAmountRupees}
                    onChangeText={setEditAmountRupees}
                    keyboardType="numeric"
                    placeholder="2000"
                    placeholderTextColor={palette.textMocha}
                    style={[
                      styles.input,
                      {
                        backgroundColor: palette.surfaceElevated,
                        borderColor: palette.borderLatte,
                        color: palette.textEspresso,
                      },
                    ]}
                  />

                  <Text
                    style={[styles.label, { color: palette.textEspresso }]}
                  >
                    Contact / Merchant Name
                  </Text>
                  <TextInput
                    value={editContactName}
                    onChangeText={setEditContactName}
                    placeholder="Ravi Sharma / DMart"
                    placeholderTextColor={palette.textMocha}
                    style={[
                      styles.input,
                      {
                        backgroundColor: palette.surfaceElevated,
                        borderColor: palette.borderLatte,
                        color: palette.textEspresso,
                      },
                    ]}
                  />

                  {(editIntent === 'UDHAAR_GAVE' ||
                    editIntent === 'UDHAAR_GOT') && (
                    <>
                      <Text
                        style={[styles.label, { color: palette.textEspresso }]}
                      >
                        Due Date (YYYY-MM-DD)
                      </Text>
                      <TextInput
                        value={editDueDate}
                        onChangeText={setEditDueDate}
                        placeholder="2026-11-10"
                        placeholderTextColor={palette.textMocha}
                        style={[
                          styles.input,
                          {
                            backgroundColor: palette.surfaceElevated,
                            borderColor: palette.borderLatte,
                            color: palette.textEspresso,
                          },
                        ]}
                      />
                    </>
                  )}

                  <Text
                    style={[styles.label, { color: palette.textEspresso }]}
                  >
                    Note / Summary
                  </Text>
                  <TextInput
                    value={editDescription}
                    onChangeText={setEditDescription}
                    placeholder="Summary note"
                    placeholderTextColor={palette.textMocha}
                    style={[
                      styles.input,
                      {
                        backgroundColor: palette.surfaceElevated,
                        borderColor: palette.borderLatte,
                        color: palette.textEspresso,
                      },
                    ]}
                  />

                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      onPress={handleDismiss}
                      disabled={dismissMutation.isPending}
                      style={[
                        styles.secondaryBtn,
                        { borderColor: palette.giveTerracottaRed },
                      ]}
                    >
                      <Text
                        style={{
                          color: palette.giveTerracottaRed,
                          fontWeight: '700',
                        }}
                      >
                        🗑️ Dismiss
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleConfirmAndSave}
                      disabled={confirmMutation.isPending}
                      style={[
                        styles.confirmBtn,
                        { backgroundColor: palette.receiveSageGreen },
                      ]}
                    >
                      <Text
                        style={{
                          color: palette.textOnPrimary,
                          fontWeight: '800',
                          fontSize: 14,
                        }}
                      >
                        {confirmMutation.isPending
                          ? 'Saving to Khata...'
                          : '✅ Confirm & Save'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

            {errorText && (
              <Text
                style={[styles.errorMsg, { color: palette.giveTerracottaRed }]}
              >
                ⚠️ {errorText}
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44, 30, 22, 0.58)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '88%',
    borderTopWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sheetTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: '800',
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 12,
  },
  waveBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
  },
  waveBar: {
    width: 7,
    height: 32,
    borderRadius: 4,
  },
  waveHint: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  recordCircleBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 74,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  primaryActionBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  clarifyBox: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 6,
  },
  clarifyBadge: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  clarifyYouSaid: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  clarifyQuestionText: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  draftCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  draftTopBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  draftSourceTag: {
    fontSize: 10,
    fontWeight: '800',
  },
  paisePreviewTag: {
    fontSize: 11,
    fontWeight: '800',
  },
  transcriptQuote: {
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  intentChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  intentChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  errorMsg: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
  },
});
