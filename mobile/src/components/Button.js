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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
        small && base.smallWrapper,
        v.wrapper,
        !isDisabled && pressed && !reducedMotion && base.pressed,
        isDisabled && base.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.spinner} size={small ? 'small' : 'small'} />
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
  smallWrapper: {
    minHeight: 38,
    paddingHorizontal: spacing.m,
    paddingVertical: 8,
    borderRadius: radius.s,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
  title: { ...type.bodyStrong, fontSize: 15, letterSpacing: 0.2 },
  smallTitle: { fontSize: 13, fontWeight: '700' },
});

const VARIANTS = (c) => ({
  primary: StyleSheet.create({
    wrapper: {
      backgroundColor: c.primary,
      elevation: 2,
      shadowColor: c.primary,
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    title: { color: c.onPrimary, fontWeight: '700' },
    spinner: c.onPrimary,
  }),
  danger: StyleSheet.create({
    wrapper: {
      backgroundColor: c.danger,
      elevation: 4,
      shadowColor: c.danger,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    title: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    spinner: '#FFFFFF',
  }),
  outline: StyleSheet.create({
    wrapper: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: c.primary },
    title: { color: c.primary, fontWeight: '700' },
    spinner: c.primary,
  }),
  ghost: StyleSheet.create({
    wrapper: { backgroundColor: 'transparent' },
    title: { color: c.primary, fontWeight: '700' },
    spinner: c.primary,
  }),
  subtle: StyleSheet.create({
    wrapper: {
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.border,
    },
    title: { color: c.primaryDark || c.primary, fontWeight: '700' },
    spinner: c.primary,
  }),
});
