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
