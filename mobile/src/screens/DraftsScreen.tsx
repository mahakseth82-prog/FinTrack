import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import {
  usePendingDrafts,
  useDismissDraft,
} from '../hooks/useFinTrackQueries';
import { IngestionDraftDto } from '../types/ledger';
import {
  SkeletonLoader,
  EmptyStateCard,
  ErrorRetryCard,
} from '../components/QueryStateViews';

interface DraftsScreenProps {
  onSelectDraftForReview: (draft: IngestionDraftDto) => void;
  onOpenVoiceSheet: () => void;
}

export const DraftsScreen: React.FC<DraftsScreenProps> = ({
  onSelectDraftForReview,
  onOpenVoiceSheet,
}) => {
  const { palette, activeWorkspaceId } = useFinTrackTheme();
  const draftsQuery = usePendingDrafts(activeWorkspaceId);
  const dismissMutation = useDismissDraft(activeWorkspaceId);

  if (draftsQuery.isLoading) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SkeletonLoader count={3} height={105} />
      </ScrollView>
    );
  }

  if (draftsQuery.isError) {
    const errMsg =
      draftsQuery.error instanceof Error
        ? draftsQuery.error.message
        : 'Could not load AI drafts from FinTrack server.';
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ErrorRetryCard
          errorMessage={errMsg}
          onRetry={() => draftsQuery.refetch()}
        />
      </ScrollView>
    );
  }

  const drafts = draftsQuery.data?.drafts || [];

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[
          styles.headerCard,
          { backgroundColor: palette.primaryBrown },
        ]}
      >
        <Text style={[styles.headerTag, { color: palette.accentWarm }]}>
          📥 AI STAGING INBOX • GOLDEN RULE #1
        </Text>
        <Text style={[styles.headerTitle, { color: palette.textOnPrimary }]}>
          Pending Drafts ({drafts.length})
        </Text>
        <Text style={[styles.headerSub, { color: palette.surfaceBeige }]}>
          Nothing touches your permanent ledger until you tap Confirm & Save.
        </Text>
      </View>

      {drafts.length === 0 ? (
        <EmptyStateCard
          emoji="🎙️"
          title="No Pending AI Drafts"
          message="Tap the center Mic button to speak in Hindi, Hinglish, or English and create a draft transaction!"
          actionLabel="🎙️ Speak Voice Entry"
          onActionPress={onOpenVoiceSheet}
        />
      ) : (
        drafts.map((draft) => {
          const needsClarification = draft.status === 'NEEDS_CLARIFICATION';
          return (
            <View
              key={draft.id}
              style={[
                styles.draftRowCard,
                {
                  backgroundColor: palette.surfaceBeige,
                  borderColor: needsClarification
                    ? palette.accentWarm
                    : palette.borderLatte,
                },
              ]}
            >
              <View style={styles.topRow}>
                <Text
                  style={[
                    styles.sourceBadge,
                    {
                      color: needsClarification
                        ? palette.warningAmber
                        : palette.primaryBrown,
                    },
                  ]}
                >
                  {draft.source} • {draft.intent}
                </Text>
                <Text
                  style={[
                    styles.amountText,
                    { color: palette.receiveSageGreen },
                  ]}
                >
                  {draft.extractedAmountFormatted || 'Amount Needed'}
                </Text>
              </View>

              <Text
                style={[styles.utteranceText, { color: palette.textEspresso }]}
              >
                &ldquo;{draft.rawInputText}&rdquo;
              </Text>

              {needsClarification && draft.ambiguityQuestion && (
                <Text
                  style={[
                    styles.questionText,
                    { color: palette.warningAmber },
                  ]}
                >
                  🤔 AI Question: {draft.ambiguityQuestion}
                </Text>
              )}

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  onPress={() => dismissMutation.mutate(draft.id)}
                  style={[
                    styles.dismissBtn,
                    { borderColor: palette.borderLatte },
                  ]}
                >
                  <Text style={{ color: palette.textMocha, fontWeight: '700', fontSize: 12 }}>
                    Dismiss
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => onSelectDraftForReview(draft)}
                  style={[
                    styles.reviewBtn,
                    {
                      backgroundColor: needsClarification
                        ? palette.accentWarm
                        : palette.receiveSageGreen,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: palette.textOnPrimary,
                      fontWeight: '800',
                      fontSize: 12,
                    }}
                  >
                    {needsClarification
                      ? '💬 Answer AI Question →'
                      : '✅ Review & Confirm →'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 110,
    gap: 12,
  },
  headerCard: {
    borderRadius: 18,
    padding: 16,
  },
  headerTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  headerSub: {
    fontSize: 12,
    marginTop: 4,
  },
  draftRowCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceBadge: {
    fontSize: 11,
    fontWeight: '800',
  },
  amountText: {
    fontSize: 17,
    fontWeight: '900',
  },
  utteranceText: {
    fontSize: 14,
    fontWeight: '700',
  },
  questionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  dismissBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  reviewBtn: {
    flex: 2,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
});
