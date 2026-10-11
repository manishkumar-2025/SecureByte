/** Formatting helpers shared by all screens. */

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return formatDateTime(iso);
}

/** e.g. 4f2c9a10-… → 4f2c9a10 (short display id for cards) */
export function shortId(id) {
  if (!id) return '';
  return id.slice(0, 8).toUpperCase();
}

export function mapsUrl(latitude, longitude) {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}
