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
 * 1. Minimal Skeleton Placeholder Loader
 */
export const SkeletonLoader: React.FC<{ count?: number; height?: number }> = ({
  count = 3,
  height = 72,
}) => {
  const pulseAnim = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.85,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.45,
          duration: 600,
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
            },
          ]}
        />
      ))}
    </View>
  );
};

/**
 * 2. Minimal Empty State Card
 */
export const EmptyStateCard: React.FC<{
  emoji?: string;
  title: string;
  message: string;
  actionLabel?: string;
  onActionPress?: () => void;
}> = ({ title, message, actionLabel, onActionPress }) => {
  const { palette } = useFinTrackTheme();

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onActionPress && (
        <TouchableOpacity
          onPress={onActionPress}
          style={[
            styles.actionBtn,
            { backgroundColor: palette.primaryBrown },
          ]}
        >
          <Text style={styles.actionBtnText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

/**
 * 3. Minimal Error State Card with Retry Button
 */
export const ErrorRetryCard: React.FC<{
  errorMessage: string;
  onRetry: () => void;
}> = ({ errorMessage, onRetry }) => {
  return (
    <View style={[styles.card, styles.errorCard]}>
      <Text style={styles.errorTitle}>Connection Issue</Text>
      <Text style={styles.message}>{errorMessage}</Text>
      <TouchableOpacity onPress={onRetry} style={styles.retryBtn}>
        <Text style={styles.actionBtnText}>Retry Connection</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  skeletonWrap: {
    gap: 10,
    marginVertical: 4,
  },
  skeletonBar: {
    width: '100%',
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  card: {
    borderRadius: 10,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#B91C1C',
    textAlign: 'center',
  },
  message: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  actionBtn: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#B91C1C',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
