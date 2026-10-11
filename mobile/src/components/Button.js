import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { radius, spacing, touchMin, type } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { useReducedMotion } from '../hooks/useTheme';

/**
 * Themed button with variants:
 *  - 'primary' (brand)  - 'danger' (SOS/critical)  - 'outline'
 *  - 'ghost' (text)     - 'subtle' (card surface)
 * Disabled/loading states prevent double submission. Danger presses
 * fire a heavy-impact haptic; other presses a light tick. Scales down
 * gently under the finger (skipped when the OS asks for less motion).
 */
export default function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  icon,
  small = false,
}) {
  const c = useTheme();
  const reducedMotion = useReducedMotion();
  const isDisabled = disabled || loading;
  const v = VARIANTS(c)[variant] || VARIANTS(c).primary;

  const handlePress = () => {
    if (isDisabled) return;
    if (variant === 'danger') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    } else {
      Haptics.selectionAsync().catch(() => {});
    }
    if (onPress) onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        base.wrapper,
        v.wrapper,
        !isDisabled && pressed && !reducedMotion && base.pressed,
        isDisabled && base.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.spinner} />
      ) : (
        <Text style={[base.title, v.title, small && base.smallTitle]}>
          {icon ? `${icon}  ` : ''}
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const base = StyleSheet.create({
  wrapper: {
    minHeight: touchMin,
    borderRadius: radius.m,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.l,
    paddingVertical: 12,
    flexDirection: 'row',
  },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
  title: { ...type.bodyStrong, fontSize: 15.5, letterSpacing: 0.1 },
  smallTitle: { fontSize: 14 },
});

const VARIANTS = (c) => ({
  primary: StyleSheet.create({
    wrapper: { backgroundColor: c.primary },
    title: { color: c.onPrimary },
    spinner: c.onPrimary,
  }),
  danger: StyleSheet.create({
    wrapper: { backgroundColor: c.danger },
    title: { color: '#FFFFFF', fontSize: 17 },
    spinner: '#FFFFFF',
  }),
  outline: StyleSheet.create({
    wrapper: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: c.primary },
    title: { color: c.primary },
    spinner: c.primary,
  }),
  ghost: StyleSheet.create({
    wrapper: { backgroundColor: 'transparent' },
    title: { color: c.primary },
    spinner: c.primary,
  }),
  subtle: StyleSheet.create({
    wrapper: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
    title: { color: c.text },
    spinner: c.primary,
  }),
});
