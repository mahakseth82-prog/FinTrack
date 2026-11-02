import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as ImageManipulator from 'expo-image-manipulator';
import { useFinTrackTheme } from '../context/ThemeContext';
import {
  useVaultDocuments,
  useUploadVaultDocument,
  useDeleteVaultDocument,
  useAnalyzeVaultDocument,
} from '../hooks/useFinTrackQueries';
import { DocumentVaultDto, DocumentVaultType } from '../types/ledger';
import {
  scheduleDocumentRenewalReminder,
  cancelDocumentRenewalReminder,
} from '../services/vaultNotificationService';
import { SYSTEM_FONT_STACK, EMERALD_THEME } from '../theme/colors';

const FILTER_TABS: { label: string; value: string }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Expiring Soon', value: 'EXPIRING_SOON' },
  { label: 'Insurance', value: 'INSURANCE' },
  { label: 'Bills', value: 'BILL' },
  { label: 'Warranties', value: 'WARRANTY' },
  { label: 'Vehicle / RC', value: 'RC_BOOK' },
  { label: 'Invoices', value: 'INVOICE' },
  { label: 'Other', value: 'OTHER' },
];

export const getExpiryStatus = (expiryDateStr: string | null | undefined) => {
  if (!expiryDateStr) return null;
  const [y, m, d] = expiryDateStr.split('-').map(Number);
  if (!y || !m || !d) return null;

  const expDate = new Date(y, m - 1, d, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffMs = expDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const formattedDate = expDate.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (diffDays < 0) {
    return {
      type: 'EXPIRED' as const,
      label: `Expired on ${formattedDate}`,
      badgeBg: '#FEF2F2',
      badgeBorder: '#FECACA',
      badgeText: '#DC2626',
      icon: 'alert-circle' as const,
    };
  } else if (diffDays <= 10) {
    const dayLabel = diffDays === 0 ? 'today' : diffDays === 1 ? 'in 1 day' : `in ${diffDays} days`;
    return {
      type: 'EXPIRING_SOON' as const,
      label: `⚠️ Renewal due ${dayLabel}`,
      badgeBg: '#FFFBEB',
      badgeBorder: '#FDE68A',
      badgeText: '#D97706',
      icon: 'warning' as const,
    };
  } else {
    return {
      type: 'ACTIVE' as const,
      label: `Valid till: ${formattedDate}`,
      badgeBg: '#F8FAFC',
      badgeBorder: '#E2E8F0',
      badgeText: '#64748B',
      icon: 'calendar-outline' as const,
    };
  }
};

const VAULT_CATEGORIES: { label: string; value: DocumentVaultType }[] = [
  { label: 'Insurance Policy', value: 'INSURANCE' },
  { label: 'Bill / Receipt', value: 'BILL' },
  { label: 'Warranty Card', value: 'WARRANTY' },
  { label: 'Vehicle Doc / RC', value: 'RC_BOOK' },
  { label: 'Business Invoice', value: 'INVOICE' },
  { label: 'Other Document', value: 'OTHER' },
];

export const VaultScreen: React.FC = () => {
  const { activeWorkspaceId } = useFinTrackTheme();
  const [selectedType, setSelectedType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentVaultDto | null>(null);

  // Staged document upload state
  const [stagedBase64, setStagedBase64] = useState<string>('');
  const [stagedMimeType, setStagedMimeType] = useState<string>('image/jpeg');
  const [stagedTitle, setStagedTitle] = useState('');
  const [stagedDocType, setStagedDocType] = useState<DocumentVaultType>('INSURANCE');
  const [stagedExpiry, setStagedExpiry] = useState('');
  const [stagedMetadata, setStagedMetadata] = useState<Record<string, unknown>>({});
  const [isAnalyzingDoc, setIsAnalyzingDoc] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const vaultQuery = useVaultDocuments(activeWorkspaceId, {
    docType: selectedType === 'EXPIRING_SOON' ? 'ALL' : selectedType,
    search: searchQuery,
  });

  const uploadDocMutation = useUploadVaultDocument(activeWorkspaceId);
  const deleteDocMutation = useDeleteVaultDocument(activeWorkspaceId);
  const analyzeDocMutation = useAnalyzeVaultDocument(activeWorkspaceId);

  const rawDocuments: DocumentVaultDto[] = useMemo(() => {
    return vaultQuery.data?.documents || [];
  }, [vaultQuery.data]);

  // Count documents expiring within 30 days or already expired
  const expiringSoonCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return rawDocuments.filter((doc) => {
      if (!doc.expiryDate) return false;
      const [y, m, d] = doc.expiryDate.split('-').map(Number);
      if (!y || !m || !d) return false;
      const exp = new Date(y, m - 1, d, 0, 0, 0);
      const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 30;
    }).length;
  }, [rawDocuments]);

  // Filtered documents list
  const documents: DocumentVaultDto[] = useMemo(() => {
    if (selectedType === 'EXPIRING_SOON') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return rawDocuments
        .filter((doc) => {
          if (!doc.expiryDate) return false;
          const [y, m, d] = doc.expiryDate.split('-').map(Number);
          if (!y || !m || !d) return false;
          const exp = new Date(y, m - 1, d, 0, 0, 0);
          const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays <= 30;
        })
        .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''));
    }
    return rawDocuments;
  }, [rawDocuments, selectedType]);

  // Analyzes document with Gemini 2.5 Flash and auto-fills title, doc_type, expiry date & metadata
  const processAndStageFile = async (base64: string, mime: string, fallbackName: string) => {
    setIsActionSheetOpen(false);
    setIsAnalyzingDoc(true);
    setStagedBase64(base64);
    setStagedMimeType(mime);
    setStagedTitle(fallbackName);
    setStagedDocType('OTHER');
    setStagedExpiry('');
    setStagedMetadata({});

    try {
      const res = await analyzeDocMutation.mutateAsync({
        fileBase64: base64,
        mimeType: mime,
      });

      if (res?.success && res.analysis) {
        const a = res.analysis;
        setStagedTitle(a.title || fallbackName);
        setStagedDocType(a.docType || 'OTHER');
        setStagedExpiry(a.expiryDate || '');
        setStagedMetadata({
          policy_or_id_number: a.policyOrIdNumber,
          provider: a.provider,
          emergency_helpline: a.emergencyHelpline,
          ai_confidence: a.confidence,
        });
      }
    } catch (err: unknown) {
      console.warn('AI document analysis error, falling back:', err);
    } finally {
      setIsAnalyzingDoc(false);
      setIsDetailsModalOpen(true);
    }
  };

  // Option 1: Take Photo via Camera
  const handleTakePhoto = async () => {
    setIsActionSheetOpen(false);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Denied', 'Camera permission is needed to take document photos.');
        return;
      }

      const res = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });

      if (!res.canceled && res.assets?.[0]?.uri) {
        const manip = await ImageManipulator.manipulateAsync(
          res.assets[0].uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );

        if (manip.base64) {
          const fallbackTitle = `Document ${new Date().toLocaleDateString('en-IN')}`;
          await processAndStageFile(manip.base64, 'image/jpeg', fallbackTitle);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Camera error';
      Alert.alert('Error', msg);
    }
  };

  // Option 2: Choose from Photo Library
  const handlePickFromGallery = async () => {
    setIsActionSheetOpen(false);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Denied', 'Gallery access is needed to pick document photos.');
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!res.canceled && res.assets?.[0]?.uri) {
        const manip = await ImageManipulator.manipulateAsync(
          res.assets[0].uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );

        if (manip.base64) {
          const fallbackTitle = `Document ${new Date().toLocaleDateString('en-IN')}`;
          await processAndStageFile(manip.base64, 'image/jpeg', fallbackTitle);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gallery error';
      Alert.alert('Error', msg);
    }
  };

  // Option 3: Browse Files / Cloud Storage (PDF & Any Docs)
  const handlePickDocumentFile = async () => {
    setIsActionSheetOpen(false);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets?.[0]?.uri) {
        const asset = res.assets[0];
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: 'base64',
        });

        const mime = asset.mimeType || (asset.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
        const cleanName = asset.name.replace(/\.[^/.]+$/, '');
        await processAndStageFile(base64, mime, cleanName);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'File pick error';
      Alert.alert('Error', msg);
    }
  };

  // Commit document upload with 10-day prior push notification reminder
  const handleSaveStagedDocument = async () => {
    if (!stagedTitle.trim()) {
      Alert.alert('Title Required', 'Please enter a name for this document.');
      return;
    }

    setIsUploading(true);
    try {
      const cleanExpiry = stagedExpiry.trim();
      let notificationId: string | null = null;

      // 10-day prior renewal notification scheduling
      if (cleanExpiry && /^\d{4}-\d{2}-\d{2}$/.test(cleanExpiry)) {
        notificationId = await scheduleDocumentRenewalReminder({
          title: stagedTitle.trim(),
          expiryDateStr: cleanExpiry,
        });
      }

      const updatedMetadata = {
        ...stagedMetadata,
        notification_id: notificationId,
        reminder_scheduled: Boolean(notificationId),
      };

      await uploadDocMutation.mutateAsync({
        title: stagedTitle.trim(),
        docType: stagedDocType,
        fileBase64: stagedBase64,
        mimeType: stagedMimeType,
        expiryDate: cleanExpiry || undefined,
        metadata: updatedMetadata,
      });

      setIsUploading(false);
      setIsDetailsModalOpen(false);
      setStagedBase64('');
      Alert.alert(
        'Saved to Vault',
        notificationId
          ? `"${stagedTitle.trim()}" has been securely stored. A 10-day renewal alert has been scheduled.`
          : `"${stagedTitle.trim()}" has been securely stored.`
      );
    } catch (err: unknown) {
      setIsUploading(false);
      const msg = err instanceof Error ? err.message : 'Failed to upload document';
      Alert.alert('Upload Failed', msg);
    }
  };

  // Delete document and auto-cancel scheduled notifications
  const handleDelete = (doc: DocumentVaultDto) => {
    Alert.alert(
      'Delete Document',
      `Are you sure you want to permanently delete "${doc.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const notifId = doc.metadata?.notification_id as string | undefined;
              if (notifId) {
                await cancelDocumentRenewalReminder(notifId);
              }
              await deleteDocMutation.mutateAsync(doc.id);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to delete';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  // Share or Download Document
  const handleShareDoc = async (doc: DocumentVaultDto) => {
    try {
      if (!doc.fileUrl) return;

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing Unavailable', 'File sharing is not available on this device.');
        return;
      }

      // Download file to local cache first
      const ext = doc.fileUrl.includes('.pdf') ? 'pdf' : 'jpg';
      const localUri = `${FileSystem.cacheDirectory}${doc.title.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`;
      const downloadRes = await FileSystem.downloadAsync(doc.fileUrl, localUri);

      await Sharing.shareAsync(downloadRes.uri, {
        dialogTitle: doc.title,
        mimeType: doc.fileUrl.includes('.pdf') ? 'application/pdf' : 'image/jpeg',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to share';
      Alert.alert('Share Error', msg);
    }
  };

  const getDocTypeBadge = (type: DocumentVaultType) => {
    switch (type) {
      case 'INSURANCE':
        return { label: 'Insurance', bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' };
      case 'BILL':
        return { label: 'Bill / Receipt', bg: '#F0F9FF', text: '#0284C7', border: '#BAE6FD' };
      case 'WARRANTY':
        return { label: 'Warranty', bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' };
      case 'RC_BOOK':
        return { label: 'Vehicle / RC', bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' };
      case 'INVOICE':
        return { label: 'Invoice', bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' };
      default:
        return { label: 'Document', bg: '#F8FAFC', text: '#475569', border: '#E2E8F0' };
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Digital Document Vault</Text>
          <Text style={styles.headerSubtitle}>Bills, Invoices, Insurance & Warranties</Text>
        </View>

        <TouchableOpacity
          onPress={() => setIsActionSheetOpen(true)}
          style={styles.headerUploadBtn}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.headerUploadBtnText}>Upload</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBarBox}>
        <Ionicons name="search-outline" size={17} color="#94A3B8" />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search saved documents..."
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle-outline" size={16} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Horizontal Filter Tabs */}
      <View style={styles.filterBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsRow}
        >
          {FILTER_TABS.map((tab) => {
            const isSelected = selectedType === tab.value;
            const isExpiringTab = tab.value === 'EXPIRING_SOON';
            const label =
              isExpiringTab && expiringSoonCount > 0
                ? `⚠️ Expiring (${expiringSoonCount})`
                : tab.label;

            return (
              <TouchableOpacity
                key={tab.value}
                onPress={() => setSelectedType(tab.value)}
                style={[
                  styles.filterChip,
                  isSelected && styles.filterChipActive,
                  isExpiringTab && expiringSoonCount > 0 && !isSelected && styles.filterChipExpiringWarn,
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isSelected && styles.filterChipTextActive,
                    isExpiringTab && expiringSoonCount > 0 && !isSelected && styles.filterChipExpiringWarnText,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Document Feed */}
      {vaultQuery.isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#0284C7" />
          <Text style={styles.loadingText}>Loading vault documents...</Text>
        </View>
      ) : documents.length === 0 ? (
        <View style={styles.centerBox}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="folder-open-outline" size={42} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>No Documents Found</Text>
          <Text style={styles.emptySubtext}>
            {searchQuery
              ? `No documents match "${searchQuery}".`
              : 'Keep all your important bills, warranties, and insurance policies secure in one private vault.'}
          </Text>
          <TouchableOpacity
            onPress={() => setIsActionSheetOpen(true)}
            style={styles.emptyUploadBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
            <Text style={styles.emptyUploadBtnText}>+ Upload First Document</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.docList}
          contentContainerStyle={styles.docListContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.docCountHeader}>
            {documents.length} {documents.length === 1 ? 'FILE' : 'FILES'} STORED
          </Text>

          {documents.map((doc) => {
            const badge = getDocTypeBadge(doc.docType);
            const expiryStatus = getExpiryStatus(doc.expiryDate);
            const isPdf = doc.fileUrl?.toLowerCase().includes('.pdf');
            const formattedDate = new Date(doc.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });

            return (
              <TouchableOpacity
                key={doc.id}
                onPress={() => setPreviewDoc(doc)}
                style={styles.docCard}
                activeOpacity={0.8}
              >
                {/* Thumbnail / Icon */}
                <View style={styles.docCardThumbBox}>
                  {doc.fileUrl && !isPdf ? (
                    <Image source={{ uri: doc.fileUrl }} style={styles.docThumbImage} />
                  ) : (
                    <View style={styles.pdfPlaceholder}>
                      <Ionicons
                        name={isPdf ? 'document-text' : 'image'}
                        size={24}
                        color={isPdf ? '#EF4444' : '#0284C7'}
                      />
                      <Text style={styles.pdfTagText}>{isPdf ? 'PDF' : 'DOC'}</Text>
                    </View>
                  )}
                </View>

                {/* Details */}
                <View style={styles.docCardInfo}>
                  <Text style={styles.docCardTitle} numberOfLines={1}>
                    {doc.title}
                  </Text>

                  <View style={styles.docCardMetaRow}>
                    <View
                      style={[
                        styles.docTypeBadge,
                        { backgroundColor: badge.bg, borderColor: badge.border },
                      ]}
                    >
                      <Text style={[styles.docTypeBadgeText, { color: badge.text }]}>
                        {badge.label}
                      </Text>
                    </View>
                    <Text style={styles.docCardDate}>{formattedDate}</Text>
                  </View>

                  {expiryStatus && (
                    <View
                      style={[
                        styles.expiryBadge,
                        {
                          backgroundColor: expiryStatus.badgeBg,
                          borderColor: expiryStatus.badgeBorder,
                        },
                      ]}
                    >
                      <Ionicons
                        name={expiryStatus.icon}
                        size={11}
                        color={expiryStatus.badgeText}
                      />
                      <Text
                        style={[
                          styles.expiryBadgeText,
                          { color: expiryStatus.badgeText },
                        ]}
                      >
                        {expiryStatus.label}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Delete Action */}
                <TouchableOpacity
                  onPress={() => handleDelete(doc)}
                  style={styles.docDeleteBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={16} color="#94A3B8" />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Action Sheet: Upload Source Picker */}
      <Modal
        visible={isActionSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsActionSheetOpen(false)}
      >
        <TouchableOpacity
          style={styles.actionSheetOverlay}
          activeOpacity={1}
          onPress={() => setIsActionSheetOpen(false)}
        >
          <View style={styles.actionSheetCard}>
            <View style={styles.sheetHandle} />
            <Text style={styles.actionSheetTitle}>Upload to Document Vault</Text>
            <Text style={styles.actionSheetSubtitle}>Select where to import your document from</Text>

            <TouchableOpacity
              onPress={handleTakePhoto}
              style={styles.sourceOptionRow}
              activeOpacity={0.7}
            >
              <View style={[styles.sourceIconBox, { backgroundColor: '#F0F9FF' }]}>
                <Ionicons name="camera" size={22} color="#0284C7" />
              </View>
              <View style={styles.sourceTextBox}>
                <Text style={styles.sourceTitle}>Take Photo</Text>
                <Text style={styles.sourceSub}>Capture receipt, bill, or warranty with camera</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePickFromGallery}
              style={styles.sourceOptionRow}
              activeOpacity={0.7}
            >
              <View style={[styles.sourceIconBox, { backgroundColor: '#F5F3FF' }]}>
                <Ionicons name="images" size={22} color="#7C3AED" />
              </View>
              <View style={styles.sourceTextBox}>
                <Text style={styles.sourceTitle}>Choose from Gallery</Text>
                <Text style={styles.sourceSub}>Select existing photos or scanned receipts</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePickDocumentFile}
              style={[styles.sourceOptionRow, { borderBottomWidth: 0 }]}
              activeOpacity={0.7}
            >
              <View style={[styles.sourceIconBox, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="folder-open" size={22} color="#059669" />
              </View>
              <View style={styles.sourceTextBox}>
                <Text style={styles.sourceTitle}>Browse Files / Cloud Storage</Text>
                <Text style={styles.sourceSub}>PDF documents, Drive, iCloud & file manager</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Document Details / Category Picker Modal */}
      <Modal
        visible={isDetailsModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsDetailsModalOpen(false)}
      >
        <View style={styles.detailsModalOverlay}>
          <View style={styles.detailsModalCard}>
            <View style={styles.detailsModalHeader}>
              <Text style={styles.detailsModalTitle}>Document Details</Text>
              <TouchableOpacity onPress={() => setIsDetailsModalOpen(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Document Title */}
              <Text style={styles.fieldLabel}>Document Title</Text>
              <TextInput
                value={stagedTitle}
                onChangeText={setStagedTitle}
                placeholder="e.g. Health Insurance Policy 2026"
                placeholderTextColor="#94A3B8"
                style={styles.inputField}
              />

              {/* Type Selector Chips */}
              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Document Type</Text>
              <View style={styles.categoryChipsWrap}>
                {VAULT_CATEGORIES.map((cat) => {
                  const isSelected = stagedDocType === cat.value;
                  return (
                    <TouchableOpacity
                      key={cat.value}
                      onPress={() => setStagedDocType(cat.value)}
                      style={[
                        styles.catChoiceChip,
                        isSelected && styles.catChoiceChipActive,
                      ]}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.catChoiceChipText,
                          isSelected && styles.catChoiceChipTextActive,
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Expiry Date (Optional) */}
              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Expiry / Renewal Date (Optional)</Text>
              <TextInput
                value={stagedExpiry}
                onChangeText={setStagedExpiry}
                placeholder="YYYY-MM-DD (e.g. 2027-03-31)"
                placeholderTextColor="#94A3B8"
                style={styles.inputField}
              />

              {/* Quick Duration Presets for 1-Tap Expiry Calculation */}
              <View style={styles.quickPresetsRow}>
                <TouchableOpacity
                  onPress={() => {
                    const d = new Date();
                    d.setMonth(d.getMonth() + 6);
                    setStagedExpiry(d.toISOString().slice(0, 10));
                  }}
                  style={styles.presetChip}
                >
                  <Text style={styles.presetChipText}>+6 Mo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    const d = new Date();
                    d.setFullYear(d.getFullYear() + 1);
                    setStagedExpiry(d.toISOString().slice(0, 10));
                  }}
                  style={[styles.presetChip, styles.presetChipHighlight]}
                >
                  <Text style={[styles.presetChipText, styles.presetChipHighlightText]}>
                    +1 Yr (Insurance)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    const d = new Date();
                    d.setFullYear(d.getFullYear() + 2);
                    setStagedExpiry(d.toISOString().slice(0, 10));
                  }}
                  style={styles.presetChip}
                >
                  <Text style={styles.presetChipText}>+2 Yrs (Warranty)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    const d = new Date();
                    d.setFullYear(d.getFullYear() + 5);
                    setStagedExpiry(d.toISOString().slice(0, 10));
                  }}
                  style={styles.presetChip}
                >
                  <Text style={styles.presetChipText}>+5 Yrs (RC)</Text>
                </TouchableOpacity>

                {Boolean(stagedExpiry) && (
                  <TouchableOpacity
                    onPress={() => setStagedExpiry('')}
                    style={styles.presetChipClear}
                  >
                    <Text style={styles.presetChipClearText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Save Button */}
              <TouchableOpacity
                onPress={handleSaveStagedDocument}
                disabled={isUploading}
                style={styles.saveDocumentBtn}
                activeOpacity={0.8}
              >
                {isUploading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                    <Text style={styles.saveDocumentBtnText}>Save to Vault</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Full-Screen Zoom & Share Modal */}
      {previewDoc && (
        <Modal
          visible={Boolean(previewDoc)}
          transparent
          animationType="fade"
          onRequestClose={() => setPreviewDoc(null)}
        >
          <View style={styles.fullScreenBackdrop}>
            <View style={styles.previewTopBar}>
              <Text style={styles.previewDocTitle} numberOfLines={1}>
                {previewDoc.title}
              </Text>
              <View style={styles.previewActionsRow}>
                <TouchableOpacity
                  onPress={() => handleShareDoc(previewDoc)}
                  style={styles.previewActionBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="share-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setPreviewDoc(null)}
                  style={styles.previewCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            {previewDoc.fileUrl ? (
              <Image
                source={{ uri: previewDoc.fileUrl }}
                style={styles.fullScreenImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.previewUnavailable}>
                <Ionicons name="alert-circle-outline" size={48} color="#94A3B8" />
                <Text style={styles.previewUnavailableText}>Preview is not available.</Text>
              </View>
            )}
          </View>
        </Modal>
      )}

      {/* AI Analyzing Overlay */}
      {isAnalyzingDoc && (
        <View style={styles.analyzingOverlay}>
          <View style={styles.analyzingCard}>
            <ActivityIndicator size="large" color="#0284C7" />
            <Text style={styles.analyzingTitle}>Reading Document with AI...</Text>
            <Text style={styles.analyzingSub}>
              Detecting policy type, renewal dates & formal title
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  headerUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0284C7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  headerUploadBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
  },
  filterBarContainer: {
    marginTop: 8,
    paddingBottom: 4,
  },
  filterChipsRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  filterChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterChipExpiringWarn: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterChipExpiringWarnText: {
    color: '#D97706',
    fontWeight: '700',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748B',
  },
  emptyIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    marginBottom: 18,
  },
  emptyUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0284C7',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyUploadBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  docList: {
    flex: 1,
  },
  docListContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 90,
  },
  docCountHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
  },
  docCardThumbBox: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  docThumbImage: {
    width: '100%',
    height: '100%',
  },
  pdfPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    marginTop: 2,
  },
  docCardInfo: {
    flex: 1,
  },
  docCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  docCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  docTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  docTypeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  docCardDate: {
    fontSize: 11,
    color: '#64748B',
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  expiryText: {
    fontSize: 10,
    color: '#D97706',
    fontWeight: '600',
  },
  expiryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  expiryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  quickPresetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  presetChipHighlight: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  presetChipHighlightText: {
    color: '#059669',
    fontWeight: '700',
  },
  presetChipClear: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  presetChipClearText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  docDeleteBtn: {
    padding: 8,
  },
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionSheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  actionSheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  actionSheetSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 16,
  },
  sourceOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sourceIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  sourceTextBox: {
    flex: 1,
  },
  sourceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  sourceSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  detailsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  detailsModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '80%',
  },
  detailsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  detailsModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputField: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
  },
  categoryChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catChoiceChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  catChoiceChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  catChoiceChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  catChoiceChipTextActive: {
    color: '#FFFFFF',
  },
  saveDocumentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0284C7',
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 20,
    marginBottom: 10,
  },
  saveDocumentBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  fullScreenBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewTopBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 12,
  },
  previewDocTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 16,
  },
  previewActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  previewActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreenImage: {
    width: '95%',
    height: '80%',
  },
  previewUnavailable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewUnavailableText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 9999,
  },
  analyzingCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  analyzingTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 14,
    fontFamily: SYSTEM_FONT_STACK,
  },
  analyzingSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    fontFamily: SYSTEM_FONT_STACK,
  },
});

export default VaultScreen;
