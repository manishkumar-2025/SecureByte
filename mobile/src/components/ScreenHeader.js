import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { spacing, type } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { useReducedMotion } from '../hooks/useTheme';

/** Consistent screen header with smart, functional back button. */
export default function ScreenHeader({ title, subtitle, onBack, right, fallbackRoute = '/home' }) {
  const c = useTheme();
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const handleBack = () => {
    if (typeof onBack === 'function') {
      onBack();
    } else {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(fallbackRoute);
      }
    }
  };

  const showBack = Boolean(onBack);

  return (
    <View style={styles.header}>
      {showBack ? (
        <Pressable
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
          android_ripple={reducedMotion ? undefined : { color: c.border, radius: 24, borderless: true }}
        >
          <Text style={[styles.backText, { color: c.text }]}>←</Text>
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}
      <View style={styles.center}>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: c.sub }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.spacer}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
  },
  back: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.xs, width: 40 },
  backText: { fontSize: 26 },
  center: { flex: 1, alignItems: 'center' },
  title: { ...type.headline, fontSize: 17.5 },
  subtitle: { fontSize: 12.5, marginTop: 1 },
  spacer: { width: 40, alignItems: 'flex-end' },
});
