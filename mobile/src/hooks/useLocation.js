import { useCallback, useState } from 'react';
import * as Location from 'expo-location';

/**
 * Permission-based location helper.
 * - permission is requested ONLY when the caller asks (never at app start)
 * - if denied, screens fall back to a manual campus landmark input
 * Returns { status, coords, error, loading, request }
 *   status: 'undetermined' | 'granted' | 'denied'
 */
export function useLocation() {
  const [status, setStatus] = useState('undetermined');
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const request = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setStatus('denied');
        return { status: 'denied', coords: null };
      }
      setStatus('granted');
      try {
        // Fast acquire with timeout to never stall emergency or reporting actions
        const posPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('GPS timeout')), 3500)
        );

        let pos;
        try {
          pos = await Promise.race([posPromise, timeoutPromise]);
        } catch (tErr) {
          // Fallback to last known position if real-time fix takes too long
          pos = await Location.getLastKnownPositionAsync().catch(() => null);
        }

        if (pos?.coords) {
          const c = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null,
            source: 'GPS',
          };
          setCoords(c);
          return { status: 'granted', coords: c };
        }

        setError('GPS fix not available. You can select a campus landmark or enter details manually.');
        return { status: 'error', coords: null };
      } catch (e) {
        setError('Could not read your GPS position. You can continue without it.');
        return { status: 'error', coords: null };
      }
    } catch (e) {
      setStatus('denied');
      setError('Location permission could not be requested. You can continue without it.');
      return { status: 'denied', coords: null };
    } finally {
      setLoading(false);
    }
  }, []);

  return { status, coords, error, loading, request };
}
