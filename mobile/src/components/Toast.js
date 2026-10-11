import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { spacing, radius, type } from '../theme';
import { useTheme } from '../hooks/useTheme';

const ToastContext = createContext(null);

/**
 * In-app toast system (no dependency). Usage:
 *   const toast = useToast();
 *   toast.success('Report submitted');
 *   toast.error('Could not reach server', 'Check your connection');
 *   toast.info('Tip', 'Add a landmark so responders find you faster');
 *
 * Renders at the top of the screen below the status bar, slides in,
 * auto-dismisses after 3.2 s (6 s for errors), and never stacks more
 * than one — the newest replaces the previous (important during an
 * emergency so critical messages are never hidden behind queues).
 */
export function ToastProvider({ children }) {
  const c = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const show = useCallback((kind, title, message) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ kind, title, message, key: Date.now() });
    if (kind === 'error') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } else if (kind === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const ttl = toast.kind === 'error' ? 6000 : 3200;
    timerRef.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
    }, ttl);
    return () => clearTimeout(timerRef.current);
  }, [toast, anim]);

  const value = useMemo(
    () => ({
      success: (title, message) => show('success', title, message),
      error: (title, message) => show('error', title, message),
      info: (title, message) => show('info', title, message),
    }),
    [show]
  );

  const KIND = {
    success: { icon: '✓', bg: c.successSoft, border: c.success, text: c.success },
    error: { icon: '✕', bg: c.dangerSoft, border: c.danger, text: c.dangerDark },
    info: { icon: 'i', bg: c.infoSoft, border: c.info, text: c.info },
  };
  const k = toast ? KIND[toast.kind] || KIND.info : KIND.info;

  const insets = useSafeAreaInsets();
  const topOffset = Math.max((insets?.top || 0) + 12, 44);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.key}
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          style={[
            styles.toast,
            {
              top: topOffset,
              backgroundColor: k.bg,
              borderColor: k.border,
              opacity: anim,
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
            },
          ]}
          pointerEvents="none"
        >
          <View style={[styles.iconWrap, { backgroundColor: k.border }]}>
            <Text style={[styles.icon, { color: '#FFFFFF' }]}>{k.icon}</Text>
          </View>
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: k.text }]}>{toast.title}</Text>
            {toast.message ? <Text style={[styles.message, { color: c.sub }]}>{toast.message}</Text> : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const fallbackToast = {
  success: () => {},
  error: () => {},
  info: () => {},
};

export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx || fallbackToast;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 44,
    left: spacing.l,
    right: spacing.l,
    borderRadius: radius.m,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    zIndex: 1000,
    elevation: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.m,
  },
  icon: { fontSize: 13, fontWeight: '900' },
  textWrap: { flex: 1 },
  title: { ...type.bodyStrong, fontSize: 14.5 },
  message: { ...type.caption, marginTop: 2 },
});
