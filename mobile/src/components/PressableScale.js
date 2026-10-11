import React, { useRef, useState } from 'react';
import { Animated, Easing, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '../hooks/useTheme';

/**
 * Pressable with a premium press micro-interaction (gentle scale-down
 * + optional haptic tick). Honours the OS "reduce motion" setting by
 * dropping the scale animation while keeping the press feedback.
 *
 * Used for every tappable surface outside of forms so the whole app
 * feels consistent under the finger.
 */
export default function PressableScale({
  children,
  onPress,
  disabled = false,
  haptic = true,
  scaleTo = 0.97,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityHint,
  style,
  hitSlop,
}) {
  const reducedMotion = useReducedMotion();
  const anim = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

  const pressIn = () => {
    setPressed(true);
    if (reducedMotion) return;
    Animated.timing(anim, {
      toValue: scaleTo,
      duration: 110,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    setPressed(false);
    if (reducedMotion) return;
    Animated.timing(anim, {
      toValue: 1,
      duration: 140,
      easing: Easing.out(Easing.back(2)),
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    if (haptic && !disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    if (onPress) onPress();
  };

  return (
    <Animated.View style={[{ transform: [{ scale: reducedMotion ? (pressed ? scaleTo : 1) : anim }] }, style]}>
      <Pressable
        onPress={handlePress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled, busy: false }}
        hitSlop={hitSlop}
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
