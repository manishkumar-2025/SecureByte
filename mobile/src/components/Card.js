import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, shadowCard, spacing, type } from '../theme';
import { useTheme } from '../hooks/useTheme';

/**
 * Rounded surface card. variant:
 *  - 'flat'   — plain surface + hairline border (default)
 *  - 'elevated' — soft shadow, slightly brighter surface (dark-mode aware)
 * SectionTitle renders the premium section heading row.
 */
export default function Card({ children, style, variant = 'flat' }) {
  const c = useTheme();
  const elevated = variant === 'elevated';
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: elevated ? c.cardElevated : c.card, borderColor: c.border },
        elevated && shadowCard,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Section heading used across screens. */
export function SectionTitle({ children, action }) {
  const c = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.section, { color: c.text }]}>{children}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.l,
    borderWidth: 1,
    padding: spacing.l,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s,
    marginTop: spacing.xl,
  },
  section: { ...type.headline, fontSize: 17, letterSpacing: -0.3, fontWeight: '800' },
});
