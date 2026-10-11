import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, type } from '../theme';
import { useTheme, useReducedMotion } from '../hooks/useTheme';

/** Full-screen loading state. */
export function LoadingScreen({ label = 'Loading…' }) {
  const c = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: c.background }]}>
      <ActivityIndicator size="large" color={c.primary} />
      <Text style={[styles.label, { color: c.sub }]}>{label}</Text>
    </View>
  );
}

/** One shimmering placeholder card. */
function SkeletonCard({ c, opacity, reducedMotion }) {
  return (
    <View style={[styles.skeletonCard, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={[styles.skeletonLine, { width: '40%', backgroundColor: c.skeleton, opacity: reducedMotion ? 0.7 : 1 }]} />
      <View style={[styles.skeletonLine, { width: '85%', backgroundColor: c.skeleton, opacity: reducedMotion ? 0.6 : 1 }]} />
      <View style={[styles.skeletonLine, { width: '60%', backgroundColor: c.skeleton, opacity: reducedMotion ? 0.7 : 1 }]} />
    </View>
  );
}

/**
 * Content-shaped placeholder for list screens — perceived performance is
 * dramatically better than a spinner on slow campus Wi-Fi. The shimmer
 * pauses (static tint) when the OS requests reduced motion.
 */
export function SkeletonList({ rows = 3 }) {
  const c = useTheme();
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    if (reducedMotion) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  return (
    <View>
      {Array.from({ length: rows }).map((_, i) => (
        <Animated.View key={i} style={{ opacity: reducedMotion ? 1 : pulse }}>
          <SkeletonCard c={c} reducedMotion={reducedMotion} />
        </Animated.View>
      ))}
    </View>
  );
}

/** Friendly empty state (icon + title + message). */
export function EmptyState({ icon = '📭', title, message }) {
  const c = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: c.sub }]}>{message}</Text> : null}
    </View>
  );
}

/** Inline error banner with retry. */
export function ErrorBanner({ message, onRetry }) {
  const c = useTheme();
  if (!message) return null;
  return (
    <View style={[styles.banner, { backgroundColor: c.dangerSoft }]} accessibilityLiveRegion="polite">
      <Text style={[styles.bannerText, { color: c.dangerDark }]}>⚠ {message}</Text>
      {onRetry ? (
        <Text onPress={onRetry} style={[styles.retry, { color: c.dangerDark }]} accessibilityRole="button">
          Retry
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  label: { marginTop: spacing.m, fontSize: 14 },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.l },
  icon: { fontSize: 44, marginBottom: spacing.m },
  title: { ...type.headline, marginBottom: 4 },
  message: { fontSize: 13.5, textAlign: 'center', lineHeight: 20 },
  banner: {
    borderRadius: radius.m,
    padding: spacing.m,
    marginBottom: spacing.m,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bannerText: { fontWeight: '600', flex: 1, fontSize: 13.5 },
  retry: { fontWeight: '800', textDecorationLine: 'underline', paddingHorizontal: spacing.s },
  skeletonCard: {
    borderRadius: radius.m,
    borderWidth: 1,
    padding: spacing.m,
    marginBottom: spacing.m,
  },
  skeletonLine: { height: 14, borderRadius: 7, marginBottom: 10 },
});
