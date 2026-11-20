import type { Mode } from './types';

export const MODE_LABELS: Record<Mode, string> = {
  interval: 'Interval',
  tabata: 'Tabata',
  emom: 'EMOM',
  amrap: 'AMRAP',
  flow: 'Kettlebell Flow',
  custom: 'Custom',
};

export const MODE_BLURBS: Record<Mode, string> = {
  interval: 'Work and rest, repeated',
  tabata: '20s on, 10s off, 8 rounds',
  emom: 'A new round every minute',
  amrap: 'As many rounds as you can',
  flow: 'Tap when done, then rest',
  custom: 'Build any sequence',
};

export function formatTime(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "45s", "10 min", "1 h 05 min". */
export function formatDuration(totalSeconds: number): string {
  const t = Math.max(0, Math.round(totalSeconds));
  if (t < 60) return `${t}s`;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

/** "Today", "Yesterday", "3 days ago", "2 weeks ago", "2 months ago" (by calendar day). */
export function relativeDay(ts: number, now: number): string {
  const a = new Date(ts);
  const b = new Date(now);
  const days = Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      86_400_000,
  );
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} ${w === 1 ? 'week' : 'weeks'} ago`;
  }
  const m = Math.floor(days / 30);
  return `${m} ${m === 1 ? 'month' : 'months'} ago`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-20" -> "Fri 20 Nov". */
export function dateLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAYS[dt.getDay()]} ${d} ${MONTHS[m - 1]}`;
}
