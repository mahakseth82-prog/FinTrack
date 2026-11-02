import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { useFinTrackTheme } from '../context/ThemeContext';
import {
  useScanBillOcr,
  useUploadVaultDocument,
} from '../hooks/useFinTrackQueries';
import { DocumentVaultType, PaymentChannel } from '../types/ledger';
import { SYSTEM_FONT_STACK } from '../theme/colors';

export interface ScannedBillResult {
  merchantOrPayee: string;
  amountRupees?: number;
  categoryName?: string;
  paymentVia: PaymentChannel;
  receiptImagePath?: string | null;
  receiptImageUrl?: string | null;
  vaultDocId?: string | null;
  summaryNote?: string;
}

interface BillScannerModalProps {
  visible: boolean;
  onClose: () => void;
  mode?: 'EXPENSE' | 'VAULT';
  onStartBackgroundScan?: (compressedBase64: string, saveToVault?: boolean) => void;
  onQrScannedSuccess?: (info: {
    amountRupees?: number;
    merchantOrPayee: string;
    note?: string;
  }) => void;
  onBillScanned?: (result: ScannedBillResult) => void;
}

/**
 * Robust UPI QR URI parser (BharatQR / UPI standard format)
 * Handles upi://pay?pa=merchant@upi&pn=Merchant%20Name&am=250.00&cu=INR&tn=Rashan
 */
export function parseUpiQrUrl(raw: string): {
  isUpi: boolean;
  payeeVpa?: string;
  payeeName?: string;
  amountRupees?: number;
  note?: string;
} {
  if (!raw) return { isUpi: false };

  const cleaned = raw.trim();
  if (!cleaned.toLowerCase().startsWith('upi://pay')) {
    return { isUpi: false };
  }

  try {
    const paMatch = cleaned.match(/[?&]pa=([^&]+)/i);
    const pnMatch = cleaned.match(/[?&]pn=([^&]+)/i);
    const amMatch = cleaned.match(/[?&]am=([^&]+)/i);
    const tnMatch = cleaned.match(/[?&]tn=([^&]+)/i);

    const payeeVpa = paMatch ? decodeURIComponent(paMatch[1]) : undefined;
    const payeeName = pnMatch ? decodeURIComponent(pnMatch[1].replace(/\+/g, ' ')) : undefined;
    const amountRupees = amMatch && !isNaN(parseFloat(amMatch[1])) ? parseFloat(amMatch[1]) : undefined;
    const note = tnMatch ? decodeURIComponent(tnMatch[1].replace(/\+/g, ' ')) : undefined;

    return {
      isUpi: true,
      payeeVpa,
      payeeName,
      amountRupees,
      note,
    };
  } catch {
    return { isUpi: false };
  }
}

export const BillScannerModal: React.FC<BillScannerModalProps> = ({
  visible,
  onClose,
  mode = 'EXPENSE',
  onStartBackgroundScan,
  onQrScannedSuccess,
  onBillScanned,
}) => {
  const { activeWorkspaceId } = useFinTrackTheme();
  const scanBillMutation = useScanBillOcr(activeWorkspaceId);
  const uploadVaultMutation = useUploadVaultDocument(activeWorkspaceId);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [hasScannedQr, setHasScannedQr] = useState(false);

  // Vault saving toggle
  const [saveToVault, setSaveToVault] = useState(mode === 'VAULT');
  const [showVaultSettings, setShowVaultSettings] = useState(false);
  const [vaultTitle, setVaultTitle] = useState('');
  const [vaultDocType, setVaultDocType] = useState<DocumentVaultType>('BILL');

  useEffect(() => {
    if (visible) {
      setHasScannedQr(false);
      setIsProcessing(false);
      setStatusMessage(null);
      setIsTorchOn(false);
      setSaveToVault(mode === 'VAULT');
      setShowVaultSettings(false);
      setVaultTitle('');
    }
  }, [visible, mode]);

  // Handle native barcode/QR scanning (Instant Zero-Touch Auto-Save)
  const handleBarcodeScanned = async (result: BarcodeScanningResult) => {
    if (hasScannedQr || isProcessing) return;

    const data = result.data?.trim();
    if (!data) return;

    const upiData = parseUpiQrUrl(data);
    if (upiData.isUpi) {
      setHasScannedQr(true);
      const name = upiData.payeeName || upiData.payeeVpa || 'UPI Merchant';
      const amount = upiData.amountRupees;

      // Immediate haptic vibration feedback
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (hapticErr) {
        console.warn('Haptic feedback notice:', hapticErr);
      }

      // Close camera modal immediately - ZERO popups, ZERO dialogs!
      onClose();

      if (onQrScannedSuccess) {
        onQrScannedSuccess({
          amountRupees: amount,
          merchantOrPayee: name,
          note: upiData.note,
        });
      } else if (onBillScanned) {
        onBillScanned({
          merchantOrPayee: name,
          amountRupees: amount,
          categoryName: 'Chai & Dining',
          paymentVia: 'UPI',
          summaryNote: upiData.note || `Paid to ${name} via UPI QR`,
        });
      }
    }
  };

  /**
   * Compresses image client-side to max dimension 1000px and JPEG quality 0.6
   * Reducing payload from ~8MB down to ~250KB for sub-second background OCR transmission.
   */
  const compressImage = async (uri: string): Promise<string> => {
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1000 } }], // Scale down from 4000px to 1000px
      {
        compress: 0.6,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );

    if (!manipResult.base64) {
      throw new Error('Image compression did not return base64 payload.');
    }
    return manipResult.base64;
  };

  // Process compressed image payload through OCR or Vault
  const processCompressedImage = async (base64Payload: string) => {
    setIsProcessing(true);
    setStatusMessage('Reading receipt with AI...');

    try {
      if (mode === 'VAULT' || (!onBillScanned && saveToVault)) {
        // Direct Standalone Vault Upload
        const docTitle =
          vaultTitle.trim() || `Document ${new Date().toLocaleDateString('en-IN')}`;
        await uploadVaultMutation.mutateAsync({
          title: docTitle,
          docType: vaultDocType,
          fileBase64: base64Payload,
          mimeType: 'image/jpeg',
        });

        setIsProcessing(false);
        Alert.alert('Saved to Vault', `"${docTitle}" has been securely stored in your Digital Document Vault.`);
        onClose();
        return;
      }

      // Expense Receipt Scanning
      const response = await scanBillMutation.mutateAsync({
        imageBase64: base64Payload,
        mimeType: 'image/jpeg',
        saveToVault,
        vaultTitle: vaultTitle.trim() || undefined,
        vaultDocType,
      });

      setIsProcessing(false);
      onClose();

      const saved = response.savedSummary;
      const ocr = response.ocrSummary;
      const draft = response.draft;

      // Extract detected values with fallback resilience
      const payee =
        saved?.title ||
        draft?.extractedContactName ||
        ocr?.merchantName ||
        'Scanned Receipt';
      const amt =
        ocr?.totalRupees ||
        (draft?.extractedAmountRupees ?? undefined) ||
        (saved?.amountPaise && saved.amountPaise > 0
          ? saved.amountPaise / 100
          : undefined);
      const cat =
        saved?.categoryName ||
        draft?.extractedCategoryName ||
        ocr?.suggestedCategory ||
        'Grocery & Rashan';
      const detectedPayment = (saved?.paymentVia ||
        draft?.paymentVia ||
        ocr?.paymentVia ||
        'UNSPECIFIED') as PaymentChannel;
      const imgPath = saved?.receiptImagePath || draft?.receiptImagePath || null;
      const imgUrl = saved?.receiptImageUrl || draft?.receiptImageUrl || null;

      if (onBillScanned) {
        onBillScanned({
          merchantOrPayee: payee,
          amountRupees: amt,
          categoryName: cat,
          paymentVia: detectedPayment,
          receiptImagePath: imgPath,
          receiptImageUrl: imgUrl,
          vaultDocId: saved?.vaultDocId || null,
          summaryNote: ocr?.summaryNote || 'Scanned bill',
        });
      }
    } catch (err: unknown) {
      setIsProcessing(false);
      console.warn('OCR processing error fallback:', err);
      // Resilient fallback: open manual entry with generic details instead of crashing!
      onClose();
      if (onBillScanned) {
        onBillScanned({
          merchantOrPayee: 'Scanned Bill',
          amountRupees: undefined,
          categoryName: 'Bills & Utilities',
          paymentVia: 'UNSPECIFIED',
          summaryNote: 'Scanned bill (manual review)',
        });
      }
    }
  };

  // Capture photo from CameraView
  const handleCapturePhoto = async () => {
    if (!cameraRef.current || isProcessing) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: true,
      });

      if (photo?.uri) {
        if (mode === 'EXPENSE' && onStartBackgroundScan) {
          // Zero-Interruption: Immediately return user to feed without blocking!
          onClose();
          const compressed = await compressImage(photo.uri);
          onStartBackgroundScan(compressed, saveToVault);
          return;
        }

        setStatusMessage('Optimizing image size...');
        const compressedBase64 = await compressImage(photo.uri);
        await processCompressedImage(compressedBase64);
      }
    } catch (err: unknown) {
      setIsProcessing(false);
      const msg = err instanceof Error ? err.message : 'Failed to capture photo';
      Alert.alert('Camera Error', msg);
    }
  };

  // Pick receipt or invoice from photo library / gallery
  const handlePickFromGallery = async () => {
    if (isProcessing) return;

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Photo library permission is needed to pick a receipt.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        if (mode === 'EXPENSE' && onStartBackgroundScan) {
          // Zero-Interruption: Immediately return user to feed without blocking!
          onClose();
          const compressed = await compressImage(result.assets[0].uri);
          onStartBackgroundScan(compressed, saveToVault);
          return;
        }

        setStatusMessage('Compressing image...');
        const compressedBase64 = await compressImage(result.assets[0].uri);
        await processCompressedImage(compressedBase64);
      }
    } catch (err: unknown) {
      setIsProcessing(false);
      const msg = err instanceof Error ? err.message : 'Failed to select image from gallery';
      Alert.alert('Gallery Error', msg);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Top Header Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.circleBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.topTitle}>
            {mode === 'VAULT' ? 'Upload Document' : 'Scan Bill or UPI QR'}
          </Text>

          <TouchableOpacity
            onPress={() => setIsTorchOn((prev) => !prev)}
            style={[styles.circleBtn, isTorchOn && styles.circleBtnActive]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons
              name={isTorchOn ? 'flash' : 'flash-outline'}
              size={18}
              color={isTorchOn ? '#F59E0B' : '#FFFFFF'}
            />
          </TouchableOpacity>
        </View>

        {/* Camera View or Permission Prompt */}
        {!permission?.granted ? (
          <View style={styles.permissionBox}>
            <Ionicons name="camera-outline" size={50} color="#94A3B8" />
            <Text style={styles.permissionTitle}>Camera Permission Required</Text>
            <Text style={styles.permissionSubtitle}>
              FinTrack needs camera access to scan paper bills and UPI QR codes.
            </Text>

            <TouchableOpacity
              onPress={requestPermission}
              style={styles.permissionBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.permissionBtnText}>Enable Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePickFromGallery}
              style={styles.permissionGalleryBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.permissionGalleryBtnText}>Choose from Gallery</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={isTorchOn}
              barcodeScannerSettings={{
                barcodeTypes: ['qr', 'code128', 'ean13', 'ean8', 'upc_a'],
              }}
              onBarcodeScanned={hasScannedQr || isProcessing ? undefined : handleBarcodeScanned}
            />

            {/* Clean Viewfinder Target Frame */}
            <View style={styles.viewfinderOverlay} pointerEvents="none">
              <View style={styles.targetFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <Text style={styles.guideText}>Align receipt or QR inside frame</Text>
            </View>
          </View>
        )}

        {/* Minimal Bottom Bar */}
        <View style={styles.bottomControlBar}>
          {/* Subtle Vault Option Toggle */}
          {mode === 'EXPENSE' && (
            <TouchableOpacity
              onPress={() => setShowVaultSettings((prev) => !prev)}
              style={styles.vaultPillToggle}
              activeOpacity={0.7}
            >
              <Ionicons
                name={saveToVault ? 'folder' : 'folder-outline'}
                size={14}
                color={saveToVault ? '#0284C7' : '#94A3B8'}
              />
              <Text
                style={[
                  styles.vaultPillText,
                  saveToVault && styles.vaultPillTextActive,
                ]}
              >
                {saveToVault ? 'Vault Copy: ON' : 'Save Copy to Vault'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Optional Title field when Vault is active */}
          {(showVaultSettings || mode === 'VAULT') && (
            <View style={styles.vaultInputMiniBox}>
              <TextInput
                value={vaultTitle}
                onChangeText={setVaultTitle}
                placeholder="Document title (optional)..."
                placeholderTextColor="#94A3B8"
                style={styles.vaultInputMini}
              />
            </View>
          )}

          {/* Shutter and Gallery Row */}
          <View style={styles.actionsRow}>
            {/* Gallery Upload Button */}
            <TouchableOpacity
              onPress={handlePickFromGallery}
              style={styles.galleryButton}
              activeOpacity={0.8}
              disabled={isProcessing}
            >
              <Ionicons name="images-outline" size={20} color="#FFFFFF" />
              <Text style={styles.galleryButtonText}>Gallery</Text>
            </TouchableOpacity>

            {/* Elevated Shutter Button */}
            <TouchableOpacity
              onPress={handleCapturePhoto}
              style={styles.shutterButton}
              activeOpacity={0.85}
              disabled={isProcessing}
            >
              <View style={styles.shutterInnerRing} />
            </TouchableOpacity>

            {/* Symmetrical Spacer */}
            <View style={styles.actionSpacer} />
          </View>
        </View>

        {/* Loading Overlay */}
        {isProcessing && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.loadingText}>{statusMessage || 'Processing...'}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    paddingTop: Platform.OS === 'ios' ? 52 : 24,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 10,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  topTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: SYSTEM_FONT_STACK,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  viewfinderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetFrame: {
    width: 260,
    height: 320,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#38BDF8',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    borderBottomRightRadius: 8,
  },
  guideText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    overflow: 'hidden',
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#0F172A',
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 14,
  },
  permissionSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    marginBottom: 20,
  },
  permissionBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  permissionGalleryBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 10,
  },
  permissionGalleryBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  bottomControlBar: {
    backgroundColor: '#0A0F1D',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 38 : 22,
    alignItems: 'center',
  },
  vaultPillToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 12,
  },
  vaultPillText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  vaultPillTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  vaultInputMiniBox: {
    width: '100%',
    marginBottom: 10,
  },
  vaultInputMini: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 12,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  galleryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  galleryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  shutterButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInnerRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFFFFF',
  },
  actionSpacer: {
    width: 70,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 14,
    textAlign: 'center',
  },
});
