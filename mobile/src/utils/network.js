import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

/**
 * Determines whether the client device is genuinely offline (no internet connectivity).
 * 
 * Rules:
 * - On Web: uses navigator.onLine (returns false ONLY if completely disconnected).
 * - On Native: uses NetInfo.fetch() (returns true ONLY if isConnected is false or isInternetReachable is false).
 * - Never falsely classifies a backend server error or DNS timeout as "offline" when internet is active.
 */
export async function isDeviceOffline() {
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return true;
    }
    return false;
  }

  try {
    const state = await NetInfo.fetch();
    // It is ONLY truly offline if isConnected is explicitly false or isInternetReachable is explicitly false
    if (state.isConnected === false) return true;
    if (state.isInternetReachable === false) return true;
    return false;
  } catch (err) {
    // If NetInfo query fails, assume online to prevent false queuing
    return false;
  }
}

/**
 * Returns detailed network connectivity state.
 */
export async function getNetworkState() {
  if (Platform.OS === 'web') {
    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
    return {
      isConnected: isOnline,
      isInternetReachable: isOnline,
      type: 'web',
    };
  }

  try {
    return await NetInfo.fetch();
  } catch (err) {
    return { isConnected: true, isInternetReachable: true, type: 'unknown' };
  }
}
