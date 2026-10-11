import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

/**
 * Polls the unread-notification count every 30 s while subscribed.
 * Returns { count, refresh, error } — the mobile equivalent of a push
 * badge, and it works in Expo Go / without FCM credentials.
 */
export function useUnreadCount(enabled = true) {
  const [count, setCount] = useState(0);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api('/api/notifications/unread-count');
      if (mounted.current) {
        setCount(data.count || 0);
        setError(null);
      }
      return data.count || 0;
    } catch (e) {
      if (mounted.current) setError(e);
      return 0;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return undefined;
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, [refresh, enabled]);

  return { count, refresh, error };
}
