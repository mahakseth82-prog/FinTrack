import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';

/**
 * 1. Animated Skeleton Placeholder Loader (No Blank Screens during Loading State)
 */
export const SkeletonLoader: React.FC<{ count?: number; height?: number }> = ({
  count = 3,
  height = 84,
}) => {
  const { palette } = useFinTrackTheme();
  const pulseAnim = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.9,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.45,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.skeletonWrap}>
      {Array.from({ length: count }).map((_, idx) => (
        <Animated.View
          key={idx}
          style={[
            styles.skeletonBar,
            {
              height,
              opacity: pulseAnim,
              backgroundColor: palette.surfaceBeige,
              borderColor: palette.borderLatte,
            },
          ]}
        />
      ))}
    </View>
  );
};

/**
 * 2. Empty State Component with Illustration Emoji & 1-Tap Action Button
 */
export const EmptyStateCard: React.FC<{
  emoji?: string;
  title: string;
  message: string;
  actionLabel?: string;
  onActionPress?: () => void;
}> = ({ emoji = '🎙️', title, message, actionLabel, onActionPress }) => {
  const { palette } = useFinTrackTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.surfaceBeige,
          borderColor: palette.borderLatte,
        },
      ]}
    >
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.title, { color: palette.textEspresso }]}>
        {title}
      </Text>
      <Text style={[styles.message, { color: palette.textMocha }]}>
        {message}
      </Text>
      {actionLabel && onActionPress && (
        <TouchableOpacity
          onPress={onActionPress}
          style={[
            styles.actionBtn,
            { backgroundColor: palette.primaryBrown },
          ]}
        >
          <Text style={[styles.actionBtnText, { color: palette.textOnPrimary }]}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

/**
 * 3. Error State Component with Clean Retry Button
 */
export const ErrorRetryCard: React.FC<{
  errorMessage: string;
  onRetry: () => void;
}> = ({ errorMessage, onRetry }) => {
  const { palette } = useFinTrackTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.giveTerracottaTint,
          borderColor: palette.giveTerracottaRed,
        },
      ]}
    >
      <Text style={styles.emoji}>⚠️</Text>
      <Text style={[styles.title, { color: palette.giveTerracottaRed }]}>
        Could Not Reach FinTrack Server
      </Text>
      <Text style={[styles.message, { color: palette.textEspresso }]}>
        {errorMessage}
      </Text>
      <TouchableOpacity
        onPress={onRetry}
        style={[
          styles.actionBtn,
          { backgroundColor: palette.giveTerracottaRed },
        ]}
      >
        <Text style={[styles.actionBtnText, { color: palette.textOnPrimary }]}>
          🔄 Retry Connection
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  skeletonWrap: {
    gap: 12,
    marginVertical: 6,
  },
  skeletonBar: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  emoji: {
    fontSize: 34,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  actionBtn: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
});

