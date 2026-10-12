import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '../utils/storage';
import {
  api,
  setAuthToken,
  setUnauthorizedHandler,
  setRefreshToken,
  setTokensRefreshedHandler,
} from '../api/client';
import { registerPushTokenWithServer, unregisterPushToken } from '../utils/pushRegister';
import { initOutboxAutoSync } from '../utils/outboxQueue';

const TOKEN_KEY = 'securebyte_token';
const REFRESH_KEY = 'securebyte_refresh';
const USER_KEY = 'securebyte_cached_user';
const AuthContext = createContext(null);

/**
 * Authentication state provider.
 * - access + refresh tokens live in secure/encrypted storage
 * - cached user profile survives offline starts without logging out
 * - on boot, validates session if online; preserves offline state on network error
 * - background outbox queue syncs automatically on connection restoration
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  const clearSession = useCallback(() => {
    setAuthToken(null);
    setRefreshToken(null);
    setUser(null);
    storage.deleteItem(TOKEN_KEY).catch(() => {});
    storage.deleteItem(REFRESH_KEY).catch(() => {});
    storage.deleteItem(USER_KEY).catch(() => {});
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);

    // Persist rotated token pairs coming out of the silent refresh.
    setTokensRefreshedHandler((data) => {
      storage.setItem(TOKEN_KEY, data.accessToken).catch(() => {});
      storage.setItem(REFRESH_KEY, data.refreshToken).catch(() => {});
    });

    // Initialize offline outbox auto-sync
    initOutboxAutoSync(api);

    return () => {
      setUnauthorizedHandler(null);
      setTokensRefreshedHandler(null);
    };
  }, [clearSession]);

  useEffect(() => {
    (async () => {
      try {
        const token = await storage.getItem(TOKEN_KEY);
        const refresh = await storage.getItem(REFRESH_KEY);
        const rawCachedUser = await storage.getItem(USER_KEY);
        let cachedUser = null;
        if (rawCachedUser) {
          try {
            cachedUser = JSON.parse(rawCachedUser);
          } catch (e) {}
        }

        if (token) {
          setAuthToken(token);
          setRefreshToken(refresh);
          if (cachedUser) setUser(cachedUser); // Instant offline boot!

          try {
            const data = await api('/api/auth/me');
            setUser(data.user);
            storage.setItem(USER_KEY, JSON.stringify(data.user)).catch(() => {});
            registerPushTokenWithServer();
          } catch (netErr) {
            // If offline, do NOT clear session! Maintain authenticated offline access
            if (netErr.code === 'NETWORK_ERROR' || netErr.status === 0) {
              if (cachedUser) setUser(cachedUser);
            } else if (netErr.status === 401) {
              clearSession();
            }
          }
        } else if (refresh) {
          setRefreshToken(refresh);
          if (cachedUser) setUser(cachedUser);

          try {
            const data = await api('/api/auth/me');
            setUser(data.user);
            storage.setItem(USER_KEY, JSON.stringify(data.user)).catch(() => {});
          } catch (netErr) {
            if (netErr.code === 'NETWORK_ERROR' || netErr.status === 0) {
              if (cachedUser) setUser(cachedUser);
            } else if (netErr.status === 401) {
              clearSession();
            }
          }
        }
      } catch (e) {
        clearSession();
      } finally {
        setInitializing(false);
      }
    })();
  }, [clearSession]);

  const persist = useCallback(async (data) => {
    await storage.setItem(TOKEN_KEY, data.accessToken);
    await storage.setItem(REFRESH_KEY, data.refreshToken);
    if (data.user) {
      await storage.setItem(USER_KEY, JSON.stringify(data.user));
    }
    setAuthToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    setUser(data.user);
    registerPushTokenWithServer();
    return data.user;
  }, []);

  const signIn = useCallback(
    async (email, password) => persist(await api('/api/auth/login', { method: 'POST', body: { email, password } })),
    [persist]
  );

  const register = useCallback(
    async (name, email, password, phone = null, requestedRole = 'STUDENT') =>
      persist(
        await api('/api/auth/register', {
          method: 'POST',
          body: { name, email, password, phone, requestedRole },
        })
      ),
    [persist]
  );

  const refreshProfile = useCallback(async () => {
    try {
      const data = await api('/api/auth/me');
      if (data && data.user) {
        setUser(data.user);
        await storage.setItem(USER_KEY, JSON.stringify(data.user));
        return data.user;
      }
    } catch (e) {}
    return null;
  }, []);

  const signOut = useCallback(async () => {
    const refresh = await storage.getItem(REFRESH_KEY).catch(() => null);
    // Tell the server to revoke the refresh token (best-effort) and stop
    // this device from receiving pushes for the next user.
    await unregisterPushToken();
    if (refresh) {
      api('/api/auth/logout', { method: 'POST', body: { refreshToken: refresh } }).catch(() => {});
    }
    clearSession();
  }, [clearSession]);

  /**
   * Optimistically updates notification preferences, then persists to
   * the server. Reverts on failure (caller surfaces the error via toast).
   */
  const updateNotificationPrefs = useCallback(async (partial) => {
    const previous = user?.notificationPrefs;
    const optimistic = { ...(previous || {}), ...partial };
    setUser((u) => (u ? { ...u, notificationPrefs: optimistic } : u));
    try {
      const data = await api('/api/me/preferences', { method: 'PUT', body: { preferences: partial } });
      setUser((u) => (u ? { ...u, notificationPrefs: data.preferences } : u));
      return data.preferences;
    } catch (err) {
      setUser((u) => (u ? { ...u, notificationPrefs: previous } : u));
      throw err;
    }
  }, [user]);

  const value = useMemo(
    () => ({ user, initializing, signIn, register, signOut, refreshProfile, updateNotificationPrefs }),
    [user, initializing, signIn, register, signOut, refreshProfile, updateNotificationPrefs]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
