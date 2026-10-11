import NetInfo from '@react-native-community/netinfo';
import { storage } from './storage';

const OUTBOX_KEY = 'securebyte_outbox_queue';
let isFlushing = false;
let autoSyncInitialized = false;

/**
 * Persistent offline outbox queue for incidents and SOS alerts.
 * Uses universal storage (SecureStore / localStorage).
 */

export async function getPendingIncidents() {
  try {
    const raw = await storage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

export async function enqueueIncident(payload) {
  try {
    const queue = await getPendingIncidents();
    const id = `outbox_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const newItem = {
      id,
      createdAt: new Date().toISOString(),
      payload,
      attempts: 0,
    };
    queue.push(newItem);
    await storage.setItem(OUTBOX_KEY, JSON.stringify(queue));
    return newItem;
  } catch (e) {
    console.warn('Failed to enqueue incident into offline outbox:', e);
    return null;
  }
}

export async function removeQueuedIncident(id) {
  try {
    const queue = await getPendingIncidents();
    const filtered = queue.filter((item) => item.id !== id);
    await storage.setItem(OUTBOX_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.warn('Failed to remove queued incident:', e);
  }
}

/**
 * Flush all pending outbox items against the server.
 * Returns { synced: number, remaining: number }.
 */
export async function flushOutbox(api) {
  if (isFlushing || typeof api !== 'function') return { synced: 0, remaining: 0 };
  isFlushing = true;

  try {
    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      isFlushing = false;
      return { synced: 0, remaining: (await getPendingIncidents()).length };
    }

    const queue = await getPendingIncidents();
    if (queue.length === 0) {
      isFlushing = false;
      return { synced: 0, remaining: 0 };
    }

    let syncedCount = 0;
    const remaining = [];

    for (const item of queue) {
      try {
        await api('/api/incidents', {
          method: 'POST',
          body: item.payload,
        });
        syncedCount += 1;
      } catch (err) {
        // If 409 DUPLICATE_SUBMISSION, the server already processed this incident
        if (err.status === 409 || err.code === 'DUPLICATE_SUBMISSION') {
          syncedCount += 1;
        } else if (err.code === 'NETWORK_ERROR' || err.status === 0) {
          // Still offline / server unreachable — retain in queue for next cycle
          remaining.push({ ...item, attempts: (item.attempts || 0) + 1 });
        } else {
          // Permanent validation or authorization error — retain with error tag
          remaining.push({ ...item, attempts: (item.attempts || 0) + 1, lastError: err.message });
        }
      }
    }

    await storage.setItem(OUTBOX_KEY, JSON.stringify(remaining));
    return { synced: syncedCount, remaining: remaining.length };
  } catch (e) {
    console.warn('Outbox flush error:', e);
    return { synced: 0, remaining: 0 };
  } finally {
    isFlushing = false;
  }
}

/**
 * Initializes automatic background synchronization whenever network connectivity returns.
 */
export function initOutboxAutoSync(api) {
  if (autoSyncInitialized || typeof api !== 'function') return;
  autoSyncInitialized = true;

  NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      flushOutbox(api).catch(() => {});
    }
  });

  // Attempt initial flush on launch
  setTimeout(() => {
    flushOutbox(api).catch(() => {});
  }, 3000);
}
