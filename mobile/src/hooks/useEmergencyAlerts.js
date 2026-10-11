import { useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Notifications, { scheduleNotificationAsync, AndroidImportance } from '../utils/notifications';

/**
 * Live emergency alert poller and local notification dispatcher.
 * Delivers immediate audio, vibration, and banner alerts on physical devices,
 * fully functional even in Expo Go where remote FCM push is restricted by Google.
 */
export function useEmergencyAlerts() {
  const { user } = useAuth();
  const seenIds = useRef(new Set());
  const initialFetchDone = useRef(false);

  useEffect(() => {
    if (!user) {
      initialFetchDone.current = false;
      seenIds.current.clear();
      return undefined;
    }

    const pollInterval = user.role === 'RESPONDER' || user.role === 'ADMIN' ? 3500 : 8000;

    const checkAlerts = async () => {
      try {
        const notifRes = await api('/api/notifications?unread=true&limit=15').catch(() => null);
        if (notifRes && Array.isArray(notifRes.items)) {
          if (!initialFetchDone.current) {
            // First run on app boot: seed existing notifications so we don't blast historical alerts
            notifRes.items.forEach((item) => seenIds.current.add(item.id));
            initialFetchDone.current = true;
          } else {
            for (const item of notifRes.items) {
              if (!seenIds.current.has(item.id)) {
                seenIds.current.add(item.id);

                // Trigger phone haptics
                try {
                  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                } catch (e) {
                  // Haptics optional
                }

                // Trigger physical phone notification banner & sound
                try {
                  await scheduleNotificationAsync({
                    content: {
                      title: item.title || '🚨 EMERGENCY SAFETY ALERT',
                      body: item.body || 'New campus safety alert requires attention.',
                      data: item.data || {},
                      sound: true,
                      vibrate: [0, 500, 200, 500],
                      priority: AndroidImportance.MAX,
                    },
                    trigger: null,
                  });
                } catch (e) {
                  console.log('[emergency-alert] scheduleNotification error:', e?.message || e);
                }
              }
            }
          }
        }

        // For responders, also monitor newly incoming unacknowledged SOS incidents
        if (user.role === 'RESPONDER' || user.role === 'ADMIN') {
          const incRes = await api('/api/responder/incidents?status=NEW&limit=5').catch(() => null);
          if (incRes && Array.isArray(incRes.items)) {
            for (const inc of incRes.items) {
              const sosKey = `incident-sos-${inc.id}`;
              if (inc.isSos && !seenIds.current.has(sosKey)) {
                seenIds.current.add(sosKey);
                if (initialFetchDone.current) {
                  try {
                    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    await scheduleNotificationAsync({
                      content: {
                        title: '🚨 EMERGENCY SOS DISPATCH',
                        body: `SOS reported by ${inc.reporter?.name || 'Student'} at ${inc.location?.campusLandmark || 'Campus'}!`,
                        data: { incidentId: inc.id, isSos: true },
                        sound: true,
                        vibrate: [0, 600, 300, 600],
                        priority: AndroidImportance.MAX,
                      },
                      trigger: null,
                    });
                  } catch (e) {
                    // silent
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        // network or background pause, keep polling
      }
    };

    checkAlerts();
    const timer = setInterval(checkAlerts, pollInterval);

    return () => {
      clearInterval(timer);
    };
  }, [user]);
}
