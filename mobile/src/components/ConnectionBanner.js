import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { spacing } from '../theme';
import { useReducedMotion } from '../hooks/useTheme';

/**
 * Slim connection banner rendered at the top of the root layout.
 * Shows whenever the device loses internet — critical for a safety app,
 * where "did my SOS go out?" must never be ambiguous. Slides in/out
 * (static when the OS requests reduced motion).
 */
export default function ConnectionBanner() {
  const [offline, setOffline] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOffline(!(state.isConnected && state.isInternetReachable !== false));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    Animated.timing(anim, { toValue: offline ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [offline, anim, reducedMotion]);

  if (!offline) return null;

  return (
    <Animated.View
      style={[styles.banner, reducedMotion ? null : { transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }] }]}
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
    >
      <Text style={styles.text}>⚠ Offline Mode Active · Cellular Helplines & SMS active · Reports auto-queue for sync</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#DC2626',
    paddingVertical: 8,
    paddingHorizontal: spacing.l,
    paddingTop: 34, // clears the Android status bar in a header-less layout
  },
  text: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '600', lineHeight: 18 },
});
