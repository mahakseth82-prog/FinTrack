import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFinTrackTheme } from '../context/ThemeContext';
import {
  useVaultDocuments,
  useDeleteVaultDocument,
} from '../hooks/useFinTrackQueries';
import { DocumentVaultDto, DocumentVaultType } from '../types/ledger';
import { BillScannerModal } from './BillScannerModal';
import { SYSTEM_FONT_STACK, EMERALD_THEME } from '../theme/colors';

interface DocumentVaultModalProps {
  visible: boolean;
  onClose: () => void;
}

const FILTER_TABS: { label: string; value: string }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Bills', value: 'BILL' },
  { label: 'Invoices', value: 'INVOICE' },
  { label: 'Insurance', value: 'INSURANCE' },
  { label: 'Warranties', value: 'WARRANTY' },
  { label: 'RC & PUC', value: 'RC_BOOK' },
  { label: 'Other', value: 'OTHER' },
];

export const DocumentVaultModal: React.FC<DocumentVaultModalProps> = ({
  visible,
  onClose,
}) => {
  const { activeWorkspaceId, mode } = useFinTrackTheme();
  const [selectedType, setSelectedType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewDoc, setPreviewDoc] = useState<DocumentVaultDto | null>(null);
  const [isUploadScannerOpen, setIsUploadScannerOpen] = useState(false);

  const vaultQuery = useVaultDocuments(activeWorkspaceId, {
    docType: selectedType,
    search: searchQuery,
  });

  const deleteDocMutation = useDeleteVaultDocument(activeWorkspaceId);

  const documents: DocumentVaultDto[] = useMemo(() => {
    return vaultQuery.data?.documents || [];
  }, [vaultQuery.data]);

  const handleDelete = (doc: DocumentVaultDto) => {
    Alert.alert(
      'Delete Document',
      `Are you sure you want to delete "${doc.title}" from your vault?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
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

  const getDocTypeBadgeColor = (type: DocumentVaultType) => {
    switch (type) {
      case 'BILL':
        return { bg: '#F0F9FF', text: '#0284C7', border: '#BAE6FD' };
      case 'INVOICE':
        return { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' };
      case 'INSURANCE':
        return { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' };
      case 'WARRANTY':
        return { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' };
      case 'RC_BOOK':
        return { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' };
      default:
        return { bg: '#F8FAFC', text: '#475569', border: '#E2E8F0' };
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
        {/* Top Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>

          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle}>Digital Document Vault</Text>
            <Text style={styles.headerSubtitle}>
              {mode === 'BUSINESS' ? 'Business Invoices & Receipts' : 'Personal Bills, Policies & Warranties'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setIsUploadScannerOpen(true)}
            style={styles.headerUploadBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.headerUploadBtnText}>Upload</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBarBox}>
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search documents by title..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle-outline" size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Horizontal Type Filter Pills */}
        <View style={styles.filterBarContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChipsRow}
          >
            {FILTER_TABS.map((tab) => {
              const isSelected = selectedType === tab.value;
              return (
                <TouchableOpacity
                  key={tab.value}
                  onPress={() => setSelectedType(tab.value)}
                  style={[
                    styles.filterChip,
                    isSelected && styles.filterChipActive,
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      isSelected && styles.filterChipTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Document List */}
        {vaultQuery.isLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#0284C7" />
            <Text style={styles.loadingText}>Loading vault documents...</Text>
          </View>
        ) : documents.length === 0 ? (
          <View style={styles.centerBox}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="folder-open-outline" size={44} color="#94A3B8" />
            </View>
            <Text style={styles.emptyTitle}>No Documents Found</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery
                ? `No documents match "${searchQuery}".`
                : 'Your vault is currently empty. Tap Upload to scan or upload receipts, warranty cards, or policies.'}
            </Text>
            <TouchableOpacity
              onPress={() => setIsUploadScannerOpen(true)}
              style={styles.emptyUploadBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
              <Text style={styles.emptyUploadBtnText}>Scan or Upload Document</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            style={styles.docList}
            contentContainerStyle={styles.docListContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.docCountHeader}>
              {documents.length} {documents.length === 1 ? 'Document' : 'Documents'} in Vault
            </Text>

            {documents.map((doc) => {
              const colors = getDocTypeBadgeColor(doc.docType);
              const formattedDate = new Date(doc.createdAt).toLocaleDateString(
                'en-IN',
                {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                }
              );

              return (
                <TouchableOpacity
                  key={doc.id}
                  onPress={() => setPreviewDoc(doc)}
                  style={styles.docCard}
                  activeOpacity={0.8}
                >
                  <View style={styles.docCardLeft}>
                    {doc.fileUrl ? (
                      <Image
                        source={{ uri: doc.fileUrl }}
                        style={styles.docThumbnail}
                      />
                    ) : (
                      <View style={styles.docThumbnailPlaceholder}>
                        <Ionicons
                          name="document-text-outline"
                          size={24}
                          color="#64748B"
                        />
                      </View>
                    )}

                    <View style={styles.docInfo}>
                      <Text style={styles.docTitle} numberOfLines={1}>
                        {doc.title}
                      </Text>

                      <View style={styles.docMetaRow}>
                        <View
                          style={[
                            styles.docTypeBadge,
                            {
                              backgroundColor: colors.bg,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[styles.docTypeBadgeText, { color: colors.text }]}
                          >
                            {doc.docType}
                          </Text>
                        </View>
                        <Text style={styles.docDateText}>{formattedDate}</Text>
                      </View>

                      {doc.expiryDate && (
                        <View style={styles.expiryBadge}>
                          <Ionicons name="time-outline" size={12} color="#D97706" />
                          <Text style={styles.expiryBadgeText}>
                            Expires: {doc.expiryDate}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleDelete(doc)}
                    style={styles.docDeleteBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={17} color="#DC2626" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Full Screen Document Preview Modal */}
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
                <TouchableOpacity
                  onPress={() => setPreviewDoc(null)}
                  style={styles.previewCloseBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
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
                  <Text style={styles.previewUnavailableText}>
                    Document preview is not available.
                  </Text>
                </View>
              )}
            </View>
          </Modal>
        )}

        {/* Standalone Upload / Scanner Modal */}
        <BillScannerModal
          visible={isUploadScannerOpen}
          mode="VAULT"
          onClose={() => setIsUploadScannerOpen(false)}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 52 : 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleBox: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 16,
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
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  headerUploadBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    marginTop: 10,
    paddingBottom: 6,
  },
  filterChipsRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  filterChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
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
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
    marginBottom: 20,
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
    paddingBottom: 40,
  },
  docCountHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  docCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  docThumbnail: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  docThumbnailPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfo: {
    flex: 1,
  },
  docTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  docMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  docTypeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  docTypeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  docDateText: {
    fontSize: 11,
    color: '#64748B',
  },
  expiryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  expiryBadgeText: {
    fontSize: 10,
    color: '#D97706',
    fontWeight: '600',
  },
  docDeleteBtn: {
    padding: 8,
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
});
