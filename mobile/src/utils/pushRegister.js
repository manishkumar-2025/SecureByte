import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Device from 'expo-device';
import Notifications from './notifications';
import { storage } from './storage';
import { api } from '../api/client';

const PUSH_TOKEN_KEY = 'securebyte_push_token';

/**
 * Push notification registration — deliberately defensive.
 *
 * Rules:
 * - Works ONLY on physical devices (Android emulators have no reliable
 *   push token; iOS simulators are the same story).
 * - NEVER prompts for permission by itself — permission is requested from
 *   the Profile screen ("Enable push alerts") so the user decides.
 * - If anything fails, the app keeps working exactly as before; push is
 *   an enhancement, not a dependency.
 *
 * Returns the Expo push token string, or null.
 */
export async function registerPushTokenWithServer() {
  try {
    if (!Device.isDevice) return null;
    await ensureAndroidChannel();

    if (Platform.OS === 'android' && isRunningInExpoGo()) {
      const settings = await Notifications.getPermissionsAsync();
      if (settings?.granted) {
        await storage.setItem('securebyte_local_alerts_enabled', 'true').catch(() => {});
        return 'expo-go-local-alerts';
      }
      return null;
    }

    const settings = await Notifications.getPermissionsAsync();
    const isIosProvisional = settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!settings.granted && !isIosProvisional) {
      return null;
    }

    // Expo Go (SDK 52) returns an Expo push token without extra setup in dev build or iOS
    const tokenResponse = await Notifications.getExpoPushTokenAsync().catch(() => null);
    const token = tokenResponse?.data;
    if (!token) return null;

    await api('/api/devices/push-token', {
      method: 'POST',
      body: { token, platform: Platform.OS },
    });
    await storage.setItem(PUSH_TOKEN_KEY, token).catch(() => {});
    return token;
  } catch (e) {
    console.log('[push] registration skipped:', e?.message || e);
    return null;
  }
}

/** Requests permission (user-initiated), then registers the token. */
export async function requestAndRegisterPushToken() {
  try {
    if (!Device.isDevice) return { ok: false, reason: 'Notifications need a physical phone (emulators cannot receive them).' };

    const settings = await Notifications.requestPermissionsAsync();
    if (!settings.granted) return { ok: false, reason: 'Notifications permission was not granted by your phone system.' };

    await ensureAndroidChannel();

    if (Platform.OS === 'android' && isRunningInExpoGo()) {
      await storage.setItem('securebyte_local_alerts_enabled', 'true').catch(() => {});
      return {
        ok: true,
        isLocalFallback: true,
        message: 'Expo Go safety alerts enabled! Audio, vibration and alert banners are active on this phone.',
      };
    }

    const token = await registerPushTokenWithServer();
    return token ? { ok: true } : { ok: false, reason: 'Could not create a push token on this device.' };
  } catch (e) {
    return { ok: false, reason: e?.message || 'Push registration failed.' };
  }
}

/** Best-effort: un-register this device (used on sign-out). */
export async function unregisterPushToken() {
  try {
    const token = await storage.getItem(PUSH_TOKEN_KEY);
    if (token) {
      await api('/api/devices/push-token', { method: 'DELETE', body: { token } }).catch(() => {});
      await storage.deleteItem(PUSH_TOKEN_KEY).catch(() => {});
    }
  } catch (e) {
    // silent
  }
}

/** Called once at app start: matches the server's channelId. */
export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('securebyte-alerts', {
      name: 'SecureByte Safety Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#DC2626',
    });
  } catch (e) {
    // silent
  }
}
