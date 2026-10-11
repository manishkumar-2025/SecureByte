import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, shadowCard, spacing, type } from '../theme';
import { useTheme } from '../hooks/useTheme';

/**
 * Compact statistic tile used on the responder dashboard and analytics
 * panels. tint: 'primary' | 'danger' | 'success' | 'purple' | 'info'.
 */
export default function StatCard({ label, value, icon, tint = 'primary', style }) {
  const c = useTheme();
  const colors = {
    primary: c.primary,
    danger: c.danger,
    success: c.success,
    purple: c.purple,
    info: c.info,
    warning: c.warning,
  };
  const color = colors[tint] || c.primary;

  return (
    <View style={[styles.card, { backgroundColor: c.cardElevated, borderColor: c.border, borderLeftColor: color }, shadowCard, style]}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={[styles.value, { color: c.text }]} accessibilityLiveRegion="polite">
        {value}
      </Text>
      <Text style={[styles.label, { color: c.sub }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 104,
    borderRadius: radius.m,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: spacing.m,
  },
  icon: { fontSize: 18, marginBottom: 4 },
  value: { ...type.title, fontSize: 24, letterSpacing: -0.5 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 2 },
});
