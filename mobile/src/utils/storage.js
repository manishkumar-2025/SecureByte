import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const memoryStore = new Map();

/**
 * Universal key-value storage wrapper.
 * - Uses expo-secure-store on native devices (iOS, Android)
 * - Falls back to localStorage / memory on Web
 */
export const storage = {
  async getItem(key) {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
      } catch (e) {
        // Fall back to memory
      }
      return memoryStore.get(key) || null;
    }

    try {
      return await SecureStore.getItemAsync(key);
    } catch (e) {
      return memoryStore.get(key) || null;
    }
  },

  async setItem(key, value) {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
          return;
        }
      } catch (e) {
        // Fall back to memory
      }
      memoryStore.set(key, value);
      return;
    }

    try {
      await SecureStore.setItemAsync(key, value);
    } catch (e) {
      memoryStore.set(key, value);
    }
  },

  async deleteItem(key) {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
          return;
        }
      } catch (e) {
        // Fall back to memory
      }
      memoryStore.delete(key);
      return;
    }

    try {
      await SecureStore.deleteItemAsync(key);
    } catch (e) {
      memoryStore.delete(key);
    }
  },
};
