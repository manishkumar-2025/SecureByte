/**
 * Safe notifications wrapper.
 * Provides fallback implementations when running in environments where
 * native push notification modules are unavailable (e.g. Expo Go on Android SDK 53+, Web).
 */

const fallback = {
  setNotificationHandler: () => {},
  scheduleNotificationAsync: async () => null,
  getPermissionsAsync: async () => ({ granted: false, status: 'undetermined' }),
  requestPermissionsAsync: async () => ({ granted: false, status: 'denied' }),
  getExpoPushTokenAsync: async () => ({ data: null }),
  setNotificationChannelAsync: async () => null,
  AndroidImportance: {
    UNKNOWN: 0,
    NONE: 0,
    MIN: 1,
    LOW: 2,
    DEFAULT: 3,
    HIGH: 4,
    MAX: 5,
  },
  IosAuthorizationStatus: {
    NOT_DETERMINED: 0,
    DENIED: 1,
    AUTHORIZED: 2,
    PROVISIONAL: 3,
    EPHEMERAL: 4,
  },
  addNotificationReceivedListener: () => ({ remove: () => {} }),
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  removeNotificationSubscription: () => {},
};

import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';

let nativeNotifications = null;

try {
  nativeNotifications = require('expo-notifications');
} catch (e) {
  // Gracefully fallback when native module is missing (e.g. web or stripped environment)
  nativeNotifications = null;
}

const Notifications = nativeNotifications || fallback;

export default Notifications;

export const setNotificationHandler = (handler) => {
  try {
    return Notifications.setNotificationHandler ? Notifications.setNotificationHandler(handler) : undefined;
  } catch (e) {
    return undefined;
  }
};

export const getPermissionsAsync = async () => {
  try {
    return Notifications.getPermissionsAsync ? await Notifications.getPermissionsAsync() : fallback.getPermissionsAsync();
  } catch (e) {
    return fallback.getPermissionsAsync();
  }
};

export const requestPermissionsAsync = async () => {
  try {
    return Notifications.requestPermissionsAsync ? await Notifications.requestPermissionsAsync() : fallback.requestPermissionsAsync();
  } catch (e) {
    return fallback.requestPermissionsAsync();
  }
};

export const getExpoPushTokenAsync = async (options) => {
  try {
    return Notifications.getExpoPushTokenAsync ? await Notifications.getExpoPushTokenAsync(options) : fallback.getExpoPushTokenAsync();
  } catch (e) {
    return fallback.getExpoPushTokenAsync();
  }
};

export const setNotificationChannelAsync = async (channelId, channel) => {
  try {
    return Notifications.setNotificationChannelAsync ? await Notifications.setNotificationChannelAsync(channelId, channel) : null;
  } catch (e) {
    return null;
  }
};

export const scheduleNotificationAsync = async (request) => {
  try {
    return Notifications.scheduleNotificationAsync ? await Notifications.scheduleNotificationAsync(request) : null;
  } catch (e) {
    console.warn('[notifications] scheduleNotificationAsync error:', e?.message || e);
    return null;
  }
};

export const AndroidImportance = Notifications.AndroidImportance || fallback.AndroidImportance;
export const IosAuthorizationStatus = Notifications.IosAuthorizationStatus || fallback.IosAuthorizationStatus;
