import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

/**
 * SecureByte API Configuration
 *
 * Your development machine's active Wi-Fi IPv4 address is auto-detected
 * from Metro bundler, with fallback to your local LAN IP (192.168.1.106).
 */
export const LAN_IP = '10.22.234.174';
export const API_PORT = 4000;

function extractHostIp() {
  const candidates = [
    Constants?.expoConfig?.hostUri,
    Constants?.linkingUri,
    Constants?.experienceUrl,
    Constants?.manifest?.debuggerHost,
    Constants?.manifest2?.extra?.expoGo?.debuggerHost,
    Constants?.manifest2?.extra?.expoClient?.hostUri,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const match = candidate.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
      if (match && match[0] && match[0] !== '127.0.0.1' && match[0] !== '0.0.0.0') {
        return match[0];
      }
    }
  }
  return null;
}

export function getApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  if (Platform.OS === 'web') {
    const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
    return `http://${host}:${API_PORT}`;
  }

  const detectedIp = extractHostIp();
  if (detectedIp) {
    return `http://${detectedIp}:${API_PORT}`;
  }

  if (Platform.OS === 'android') {
    if (!Device.isDevice) {
      // Android Emulator loopback
      return `http://10.0.2.2:${API_PORT}`;
    }
    // Physical Android Phone on local Wi-Fi
    return `http://${LAN_IP}:${API_PORT}`;
  }

  return `http://${LAN_IP}:${API_PORT}`;
}
