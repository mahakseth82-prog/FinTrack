import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
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
  onBillScanned?: (result: ScannedBillResult) => void;
}

const VAULT_CATEGORIES: { label: string; value: DocumentVaultType }[] = [
  { label: 'Bills & Receipts', value: 'BILL' },
  { label: 'Invoices', value: 'INVOICE' },
  { label: 'Insurance Policy', value: 'INSURANCE' },
  { label: 'Warranty Cards', value: 'WARRANTY' },
  { label: 'Vehicle RC / PUC', value: 'RC_BOOK' },
  { label: 'Other Document', value: 'OTHER' },
];

/**
 * Parses UPI QR URI (e.g. upi://pay?pa=shop@upi&pn=Kirana%20Store&am=250.00&cu=INR&tn=Rashan)
 */
export function parseUpiQrUrl(raw: string): {
  isUpi: boolean;
  payeeVpa?: string;
  payeeName?: string;
  amountRupees?: number;
  note?: string;
} {
  if (!raw || !raw.toLowerCase().startsWith('upi://pay')) {
    return { isUpi: false };
  }

  try {
    const pa = raw.match(/[?&]pa=([^&]+)/i)?.[1];
    const pn = raw.match(/[?&]pn=([^&]+)/i)?.[1];
    const am = raw.match(/[?&]am=([^&]+)/i)?.[1];
    const tn = raw.match(/[?&]tn=([^&]+)/i)?.[1];

    return {
      isUpi: true,
      payeeVpa: pa ? decodeURIComponent(pa) : undefined,
      payeeName: pn ? decodeURIComponent(pn.replace(/\+/g, ' ')) : undefined,
      amountRupees: am && !isNaN(parseFloat(am)) ? parseFloat(am) : undefined,
      note: tn ? decodeURIComponent(tn.replace(/\+/g, ' ')) : undefined,
    };
  } catch {
    return { isUpi: false };
  }
}

export const BillScannerModal: React.FC<BillScannerModalProps> = ({
  visible,
  onClose,
  mode = 'EXPENSE',
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
  const [vaultTitle, setVaultTitle] = useState('');
  const [vaultDocType, setVaultDocType] = useState<DocumentVaultType>(
    mode === 'VAULT' ? 'BILL' : 'BILL'
  );

  useEffect(() => {
    if (visible) {
      setHasScannedQr(false);
      setIsProcessing(false);
      setStatusMessage(null);
      setIsTorchOn(false);
      setSaveToVault(mode === 'VAULT');
      setVaultTitle('');
    }
  }, [visible, mode]);

  // Handle native barcode/QR scanning
  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (hasScannedQr || isProcessing) return;

    const data = result.data?.trim();
    if (!data) return;

    const upiData = parseUpiQrUrl(data);
    if (upiData.isUpi) {
      setHasScannedQr(true);
      const name = upiData.payeeName || upiData.payeeVpa || 'UPI Payee';
      const amount = upiData.amountRupees;

      Alert.alert(
        'UPI QR Code Scanned',
        `Payee: ${name}\n${amount ? `Amount: ₹${amount}` : 'Amount: Not specified in QR'}`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setHasScannedQr(false),
          },
          {
            text: 'Use Details',
            onPress: () => {
              onClose();
              if (onBillScanned) {
                onBillScanned({
                  merchantOrPayee: name,
                  amountRupees: amount,
                  categoryName: 'Chai & Dining',
                  paymentVia: 'UPI',
                  summaryNote: upiData.note || `Paid to ${name} via QR`,
                });
              }
            },
          },
        ]
      );
    }
  };

  // Process image (either snapped or picked from gallery)
  const processImageBase64 = async (
    imageBase64: string,
    mimeType = 'image/jpeg'
  ) => {
    setIsProcessing(true);
    setStatusMessage('Analyzing with Gemini AI OCR...');

    try {
      if (mode === 'VAULT' || (!onBillScanned && saveToVault)) {
        // Direct Standalone Vault Upload
        const docTitle = vaultTitle.trim() || `Document ${new Date().toLocaleDateString('en-IN')}`;
        await uploadVaultMutation.mutateAsync({
          title: docTitle,
          docType: vaultDocType,
          fileBase64: imageBase64,
          mimeType,
        });

        setIsProcessing(false);
        Alert.alert('Saved to Vault', `"${docTitle}" has been securely stored in your Digital Document Vault.`);
        onClose();
        return;
      }

      // Expense Receipt Scanning
      const response = await scanBillMutation.mutateAsync({
        imageBase64,
        mimeType,
        saveToVault,
        vaultTitle: vaultTitle.trim() || undefined,
        vaultDocType,
      });

      setIsProcessing(false);
      onClose();

      const saved = response.savedSummary;
      const ocr = response.ocrSummary;

      const detectedPayment = (saved?.paymentVia || ocr?.paymentVia || 'UNSPECIFIED') as PaymentChannel;
      const payee = saved?.title || ocr?.merchantName || 'Scanned Bill';
      const amt = ocr?.totalRupees || (saved?.amountPaise ? saved.amountPaise / 100 : undefined);

      if (onBillScanned) {
        onBillScanned({
          merchantOrPayee: payee,
          amountRupees: amt,
          categoryName: saved?.categoryName || ocr?.suggestedCategory || 'Grocery & Rashan',
          paymentVia: detectedPayment,
          receiptImagePath: saved?.receiptImagePath || null,
          receiptImageUrl: saved?.receiptImageUrl || null,
          vaultDocId: saved?.vaultDocId || null,
          summaryNote: ocr?.summaryNote,
        });
      }
    } catch (err: unknown) {
      setIsProcessing(false);
      const msg = err instanceof Error ? err.message : 'OCR scan failed';
      Alert.alert('Scan Failed', msg);
    }
  };

  // Snap photo from CameraView
  const handleCapturePhoto = async () => {
    if (!cameraRef.current || isProcessing) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.85,
        skipProcessing: true,
      });

      if (photo?.base64) {
        await processImageBase64(photo.base64, 'image/jpeg');
      }
    } catch (err: unknown) {
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
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.85,
        allowsEditing: true,
      });

      if (!result.canceled && result.assets?.[0]?.base64) {
        const asset = result.assets[0];
        await processImageBase64(asset.base64!, asset.mimeType || 'image/jpeg');
      }
    } catch (err: unknown) {
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
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.topTitleBox}>
            <Text style={styles.topTitle}>
              {mode === 'VAULT' ? 'Upload Document to Vault' : 'Scan Bill or BharatQR'}
            </Text>
            <Text style={styles.topSubtitle}>
              {mode === 'VAULT' ? 'Invoices, Policies & Warranties' : 'AI extracts total, merchant & items'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setIsTorchOn((prev) => !prev)}
            style={[styles.circleBtn, isTorchOn && styles.circleBtnActive]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons
              name={isTorchOn ? 'flash' : 'flash-outline'}
              size={20}
              color={isTorchOn ? '#F59E0B' : '#FFFFFF'}
            />
          </TouchableOpacity>
        </View>

        {/* Camera View or Permission Prompt */}
        {!permission?.granted ? (
          <View style={styles.permissionBox}>
            <Ionicons name="camera-outline" size={56} color="#94A3B8" />
            <Text style={styles.permissionTitle}>Camera Permission Required</Text>
            <Text style={styles.permissionSubtitle}>
              FinTrack needs access to your camera to scan paper bills, parchi receipts, and UPI QR codes.
            </Text>

            <TouchableOpacity
              onPress={requestPermission}
              style={styles.permissionBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="shield-checkmark-outline" size={18} color="#FFFFFF" />
              <Text style={styles.permissionBtnText}>Enable Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePickFromGallery}
              style={styles.permissionGalleryBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="images-outline" size={18} color="#0F172A" />
              <Text style={styles.permissionGalleryBtnText}>Or Pick from Gallery</Text>
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
                barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'upc_a'],
              }}
              onBarcodeScanned={handleBarcodeScanned}
            />

            {/* Viewfinder Target Frame */}
            <View style={styles.viewfinderOverlay}>
              <View style={styles.targetFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
                <Text style={styles.guideText}>Align bill or QR code inside frame</Text>
              </View>
            </View>
          </View>
        )}

        {/* Vault Save Options Drawer */}
        <View style={styles.bottomSheet}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Vault Checkbox */}
            {mode === 'EXPENSE' && (
              <TouchableOpacity
                onPress={() => setSaveToVault((prev) => !prev)}
                style={styles.vaultToggleRow}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.checkboxBox,
                    saveToVault && styles.checkboxBoxChecked,
                  ]}
                >
                  {saveToVault && (
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  )}
                </View>
                <View style={styles.vaultToggleTextBox}>
                  <Text style={styles.vaultToggleTitle}>
                    Save copy to Documents & Insurance Vault
                  </Text>
                  <Text style={styles.vaultToggleSubtitle}>
                    Keep private signed digital backup for claims or warranty
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Vault Type & Title if active */}
            {(saveToVault || mode === 'VAULT') && (
              <View style={styles.vaultOptionsBox}>
                <Text style={styles.vaultInputLabel}>Document Title</Text>
                <TextInput
                  value={vaultTitle}
                  onChangeText={setVaultTitle}
                  placeholder={mode === 'VAULT' ? 'e.g. Car Insurance 2026, Laptop Bill' : 'Optional document title...'}
                  placeholderTextColor="#94A3B8"
                  style={styles.vaultInput}
                />

                <Text style={[styles.vaultInputLabel, { marginTop: 10 }]}>Document Type</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.vaultTypeChipsRow}
                >
                  {VAULT_CATEGORIES.map((cat) => {
                    const isSelected = vaultDocType === cat.value;
                    return (
                      <TouchableOpacity
                        key={cat.value}
                        onPress={() => setVaultDocType(cat.value)}
                        style={[
                          styles.vaultTypeChip,
                          isSelected && styles.vaultTypeChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.vaultTypeChipText,
                            isSelected && styles.vaultTypeChipTextActive,
                          ]}
                        >
                          {cat.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Controls: Gallery Button + Shutter Capture */}
            <View style={styles.controlsRow}>
              {/* Gallery Button */}
              <TouchableOpacity
                onPress={handlePickFromGallery}
                style={styles.galleryBtn}
                activeOpacity={0.8}
                disabled={isProcessing}
              >
                <Ionicons name="images-outline" size={20} color="#0F172A" />
                <Text style={styles.galleryBtnText}>Gallery</Text>
              </TouchableOpacity>

              {/* Shutter Capture Button */}
              <TouchableOpacity
                onPress={handleCapturePhoto}
                style={styles.shutterBtn}
                activeOpacity={0.8}
                disabled={isProcessing}
              >
                <View style={styles.shutterInner} />
              </TouchableOpacity>

              {/* Spacer / Right Balance */}
              <View style={styles.controlSpacer}>
                <Text style={styles.scannerHint}>
                  {mode === 'VAULT' ? 'Capture' : 'Snap Bill'}
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* Loading / OCR Processing Overlay */}
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
    paddingTop: Platform.OS === 'ios' ? 54 : 24,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 10,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  topTitleBox: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  topTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: SYSTEM_FONT_STACK,
  },
  topSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontFamily: SYSTEM_FONT_STACK,
    marginTop: 2,
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
    width: 270,
    height: 330,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 16,
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#38BDF8',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 10,
  },
  guideText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
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
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  permissionSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
    marginBottom: 24,
  },
  permissionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0284C7',
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 12,
  },
  permissionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  permissionGalleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  permissionGalleryBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  bottomSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    maxHeight: 280,
  },
  vaultToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxBoxChecked: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  vaultToggleTextBox: {
    flex: 1,
  },
  vaultToggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  vaultToggleSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  vaultOptionsBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  vaultInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  vaultInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  vaultTypeChipsRow: {
    gap: 8,
    paddingVertical: 4,
  },
  vaultTypeChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  vaultTypeChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  vaultTypeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  vaultTypeChipTextActive: {
    color: '#FFFFFF',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  galleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  galleryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  shutterBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 4,
    borderColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#0284C7',
  },
  controlSpacer: {
    minWidth: 70,
    alignItems: 'flex-end',
  },
  scannerHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
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
