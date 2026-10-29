import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFinTrackTheme } from '../context/ThemeContext';
import {
  useScanBillOcr,
  useIngestUpiNotification,
} from '../hooks/useFinTrackQueries';
import { IngestionDraftDto } from '../types/ledger';
import { ALLOWED_UPI_PACKAGES } from '../services/upiNotificationBridge';

interface ScannerAndUpiScreenProps {
  onOpenDraftForConfirmation: (draft: IngestionDraftDto) => void;
}

export const ScannerAndUpiScreen: React.FC<ScannerAndUpiScreenProps> = ({
  onOpenDraftForConfirmation,
}) => {
  const { palette, activeWorkspaceId } = useFinTrackTheme();
  const scanBillMutation = useScanBillOcr(activeWorkspaceId);
  const ingestUpiMutation = useIngestUpiNotification(activeWorkspaceId);

  const [selectedPackage, setSelectedPackage] = useState(
    'com.google.android.apps.nbu.paisa.user'
  );
  const [notifTitle, setNotifTitle] = useState('Google Pay');
  const [notifBody, setNotifBody] = useState('');
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);

  const handleCaptureOrPickBill = async (useCamera: boolean) => {
    setErrorFeedback(null);
    setStatusFeedback(null);

    try {
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setErrorFeedback('Camera permission is required to scan a paper bill.');
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setErrorFeedback('Photo library permission is required to pick a bill image.');
          return;
        }
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            base64: true,
            quality: 0.7,
          })
        : await ImagePicker.launchImageLibraryAsync({
            base64: true,
            quality: 0.7,
          });

      if (result.canceled || !result.assets?.[0]?.base64) {
        return;
      }

      const asset = result.assets[0];
      const res = await scanBillMutation.mutateAsync({
        imageBase64: asset.base64!,
        mimeType: asset.mimeType || 'image/jpeg',
      });

      setStatusFeedback(
        `✅ Bill Scanned! Extracted ${
          res.draft.extractedAmountFormatted || 'Draft'
        } from ${res.draft.extractedContactName || 'Bill'}.`
      );
      onOpenDraftForConfirmation(res.draft);
    } catch (err: unknown) {
      setErrorFeedback(
        err instanceof Error ? err.message : 'Bill OCR scan failed.'
      );
    }
  };

  const handleIngestNotification = async () => {
    if (!notifBody.trim()) {
      setErrorFeedback(
        'Please enter a UPI notification message (including ₹ amount) to test ingestion & deduplication.'
      );
      return;
    }
    setErrorFeedback(null);
    setStatusFeedback(null);

    try {
      const res = await ingestUpiMutation.mutateAsync({
        packageName: selectedPackage,
        title: notifTitle.trim() || ALLOWED_UPI_PACKAGES[selectedPackage],
        body: notifBody.trim(),
      });

      if (res.duplicateSkipped) {
        setStatusFeedback(
          `🛡️ Deduplication Active! Duplicate notification suppressed (Fingerprint: ${res.fingerprint.slice(
            0,
            10
          )}...).`
        );
      } else {
        setStatusFeedback(
          `✅ UPI Draft Created (${res.draft.extractedAmountFormatted})! Opening confirmation sheet...`
        );
        onOpenDraftForConfirmation(res.draft);
      }
    } catch (err: unknown) {
      setErrorFeedback(
        err instanceof Error ? err.message : 'Failed to parse UPI notification'
      );
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Paper Bill Camera Scanner Card (Gemini Vision OCR) */}
      <View
        style={[
          styles.heroCard,
          { backgroundColor: palette.primaryBrown },
        ]}
      >
        <Text style={[styles.heroTag, { color: palette.accentWarm }]}>
          📷 PHASE 5 • GEMINI VISION BILL OCR
        </Text>
        <Text style={[styles.heroTitle, { color: palette.textOnPrimary }]}>
          Scan Paper Bill / Dukaan Parchi
        </Text>
        <Text style={[styles.heroSub, { color: palette.surfaceBeige }]}>
          Click a photo of any receipt or kirana parchi. Gemini Vision extracts
          the shop name, items, and total into an editable draft card.
        </Text>

        <View style={styles.cameraRow}>
          <TouchableOpacity
            onPress={() => handleCaptureOrPickBill(true)}
            disabled={scanBillMutation.isPending}
            style={[
              styles.cameraBtn,
              { backgroundColor: palette.accentWarm },
            ]}
          >
            <Text style={[styles.cameraBtnText, { color: palette.textEspresso }]}>
              {scanBillMutation.isPending
                ? '🤖 Reading Bill...'
                : '📷 Open Camera'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleCaptureOrPickBill(false)}
            disabled={scanBillMutation.isPending}
            style={[
              styles.galleryBtn,
              {
                backgroundColor: palette.surfaceBeige,
              },
            ]}
          >
            <Text style={[styles.cameraBtnText, { color: palette.textEspresso }]}>
              🖼️ Pick Bill Photo
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Android UPI Notification Listener & Deduplication Engine */}
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
          🔔 Smart UPI Notification Detector & Deduplicator
        </Text>
        <Text style={[styles.sectionDesc, { color: palette.textMocha }]}>
          Uses Android NotificationListenerService (Play Store safe — no
          restricted SMS permissions). Automatically deduplicates if both GPay
          and your Bank send a notification for the same payment!
        </Text>

        <Text style={[styles.label, { color: palette.textEspresso }]}>
          Source App Package:
        </Text>
        <View style={styles.pkgRow}>
          {Object.entries(ALLOWED_UPI_PACKAGES)
            .slice(0, 4)
            .map(([pkg, label]) => (
              <TouchableOpacity
                key={pkg}
                onPress={() => {
                  setSelectedPackage(pkg);
                  setNotifTitle(label);
                }}
                style={[
                  styles.pkgChip,
                  {
                    backgroundColor:
                      selectedPackage === pkg
                        ? palette.primaryBrown
                        : palette.surfaceElevated,
                    borderColor: palette.borderLatte,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color:
                      selectedPackage === pkg
                        ? palette.textOnPrimary
                        : palette.textEspresso,
                  }}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
        </View>

        <Text style={[styles.label, { color: palette.textEspresso }]}>
          Notification Body Text:
        </Text>
        <TextInput
          value={notifBody}
          onChangeText={setNotifBody}
          multiline
          placeholder='e.g. "Paid ₹180 to Raju Tea Stall via UPI Ref 630211449988"'
          placeholderTextColor={palette.textMocha}
          style={[
            styles.inputArea,
            {
              backgroundColor: palette.surfaceElevated,
              borderColor: palette.borderLatte,
              color: palette.textEspresso,
            },
          ]}
        />

        <TouchableOpacity
          onPress={handleIngestNotification}
          disabled={ingestUpiMutation.isPending}
          style={[
            styles.ingestBtn,
            { backgroundColor: palette.primaryBrown },
          ]}
        >
          <Text
            style={{
              color: palette.textOnPrimary,
              fontWeight: '800',
              fontSize: 13,
            }}
          >
            {ingestUpiMutation.isPending
              ? 'Processing Notification...'
              : '🔔 Ingest UPI Notification & Check Dedupe →'}
          </Text>
        </TouchableOpacity>

        {statusFeedback && (
          <View
            style={[
              styles.feedbackBox,
              {
                backgroundColor: palette.receiveSageTint,
                borderColor: palette.receiveSageGreen,
              },
            ]}
          >
            <Text
              style={{
                color: palette.receiveSageGreen,
                fontSize: 12,
                fontWeight: '800',
              }}
            >
              {statusFeedback}
            </Text>
          </View>
        )}

        {errorFeedback && (
          <View
            style={[
              styles.feedbackBox,
              {
                backgroundColor: palette.giveTerracottaTint,
                borderColor: palette.giveTerracottaRed,
              },
            ]}
          >
            <Text
              style={{
                color: palette.giveTerracottaRed,
                fontSize: 12,
                fontWeight: '800',
              }}
            >
              ⚠️ {errorFeedback}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 110,
    gap: 14,
  },
  heroCard: {
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  heroTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  heroSub: {
    fontSize: 12,
    lineHeight: 18,
  },
  cameraRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  cameraBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  galleryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cameraBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  sectionCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  pkgRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pkgChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  inputArea: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    minHeight: 72,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  ingestBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  feedbackBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
  },
});

