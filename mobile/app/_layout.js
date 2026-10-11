import React, { useEffect } from 'react';
import { LogBox, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

if (typeof console !== 'undefined' && console.warn) {
  const _warn = console.warn;
  console.warn = (...args) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (
      msg.includes('expo-notifications') ||
      msg.includes('shouldShowAlert') ||
      msg.includes('Android Push notifications')
    ) {
      return;
    }
    _warn(...args);
  };
}

LogBox.ignoreLogs([
  'SafeAreaView has been deprecated',
  'expo-notifications',
  '`expo-notifications` functionality is not fully supported',
  'Android Push notifications',
  'shouldShowAlert',
]);
import Notifications from '../src/utils/notifications';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/components/Toast';
import { ConfirmProvider } from '../src/components/ConfirmDialog';
import ConnectionBanner from '../src/components/ConnectionBanner';
import { ensureAndroidChannel } from '../src/utils/pushRegister';
import { useTheme } from '../src/hooks/useTheme';
import { useEmergencyAlerts } from '../src/hooks/useEmergencyAlerts';

// Show alerts while the app is open (foreground). Background/alert-state
// presentations are handled by the OS + notification channel config.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (e) {
  // Gracefully ignored in environments where notifications handler is restricted
}

function ThemedShell() {
  const c = useTheme();
  useEmergencyAlerts();

  return (
    <>
      {/* Status bar follows the active palette (light content on dark bg). */}
      <StatusBar style={c.isDark ? 'light' : 'dark'} />
      <ConnectionBanner />
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: c.background },
          }}
        />
      </View>
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    ensureAndroidChannel();
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <ThemedShell />
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
