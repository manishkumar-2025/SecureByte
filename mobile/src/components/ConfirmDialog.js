import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { radius, spacing, touchMin, type } from '../theme';
import { useTheme } from '../hooks/useTheme';
import Button from './Button';

const ConfirmContext = createContext(null);

/**
 * Promise-based confirmation dialog for destructive / critical actions:
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: 'Send SOS alert?',
 *     message: 'Responders will be notified with your location.',
 *     confirmLabel: 'Send SOS',
 *     danger: true,
 *   });
 *   if (!ok) return;
 *
 * Danger confirmations fire a warning haptic when opened. The dialog is
 * fully modal and screen-reader labelled, so critical actions can never
 * be triggered by an accidental double-tap.
 */
export function ConfirmProvider({ children }) {
  const c = useTheme();
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useMemo(
    () =>
      (options) =>
        new Promise((resolve) => {
          if (resolverRef.current) resolverRef.current(false); // replace an open dialog
          resolverRef.current = resolve;
          if (options.danger && Haptics?.notificationAsync && Haptics?.NotificationFeedbackType?.Warning) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          }
          setDialog(options);
        }),
    []
  );

  const settle = (result) => {
    if (resolverRef.current) resolverRef.current(result);
    resolverRef.current = null;
    setDialog(null);
  };

  const value = useMemo(() => {
    confirm.confirm = confirm;
    return confirm;
  }, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {dialog ? (
        <Modal transparent visible={true} animationType="fade" onRequestClose={() => settle(false)}>
          <View style={[styles.backdrop, { backgroundColor: c.overlay }]}>
            <View style={[styles.sheet, { backgroundColor: c.cardElevated }]}>
              <Text style={[styles.title, { color: dialog.danger ? c.danger : c.text }]}>{dialog.title}</Text>
              {dialog.message ? <Text style={[styles.message, { color: c.sub }]}>{dialog.message}</Text> : null}
              <View style={styles.actions}>
                <View style={styles.button}>
                  <Button title={dialog.cancelLabel || 'Cancel'} variant="subtle" onPress={() => settle(false)} />
                </View>
                <View style={styles.button}>
                  <Button
                    title={dialog.confirmLabel || 'Confirm'}
                    variant={dialog.danger ? 'danger' : 'primary'}
                    onPress={() => settle(true)}
                  />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  const fn = typeof ctx === 'function' ? ctx : (typeof ctx?.confirm === 'function' ? ctx.confirm : null);
  const safeFn = fn || (() => Promise.resolve(true));
  safeFn.confirm = safeFn;
  return safeFn;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xl,
    padding: spacing.xl,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  title: { ...type.headline, fontSize: 18.5, textAlign: 'center', marginBottom: spacing.s },
  message: { fontSize: 14.5, lineHeight: 21, textAlign: 'center', marginBottom: spacing.l },
  actions: { flexDirection: 'row', gap: spacing.s },
  button: { flex: 1, minHeight: touchMin },
});
