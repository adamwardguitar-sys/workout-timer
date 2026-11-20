import type { Session } from './history';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(ts: number | Date): string {
  const d = typeof ts === 'number' ? new Date(ts) : ts;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Midnight at the start of the Monday of the week containing `ts`. */
function mondayOf(ts: number): Date {
  const d = new Date(ts);
  const offset = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
}

export function thisWeek(sessions: Session[], now: number): { sessions: number; seconds: number } {
  const start = mondayOf(now).getTime();
  const mine = sessions.filter((s) => s.startedAt >= start && s.startedAt <= now);
  return { sessions: mine.length, seconds: mine.reduce((sum, s) => sum + s.durationSec, 0) };
}

/** Consecutive days with a session, counting back from today (or yesterday if you have not trained yet today). */
export function streakDays(sessions: Session[], now: number): number {
  const days = new Set(sessions.map((s) => dayKey(s.startedAt)));
  const t = new Date(now);
  let cursor = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  if (!days.has(dayKey(cursor))) cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count++;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return count;
}

export interface DayCell {
  date: string;
  count: number;
  seconds: number;
  future: boolean;
}

/** `weeks` Monday-to-Sunday weeks ending with the current one, oldest day first. */
export function activityGrid(sessions: Session[], now: number, weeks = 4): DayCell[] {
  const byDay = new Map<string, { count: number; seconds: number }>();
  for (const s of sessions) {
    const k = dayKey(s.startedAt);
    const cur = byDay.get(k) ?? { count: 0, seconds: 0 };
    byDay.set(k, { count: cur.count + 1, seconds: cur.seconds + s.durationSec });
  }
  const first = mondayOf(now);
  const today = dayKey(now);
  const cells: DayCell[] = [];
  for (let i = -(weeks - 1) * 7; i < 7; i++) {
    const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const k = dayKey(d);
    cells.push({ date: k, count: byDay.get(k)?.count ?? 0, seconds: byDay.get(k)?.seconds ?? 0, future: k > today });
  }
  return cells;
}

export function workoutStats(sessions: Session[]): Map<string, { count: number; lastAt: number }> {
  const map = new Map<string, { count: number; lastAt: number }>();
  for (const s of sessions) {
    const cur = map.get(s.workoutId);
    map.set(s.workoutId, { count: (cur?.count ?? 0) + 1, lastAt: Math.max(cur?.lastAt ?? 0, s.startedAt) });
  }
  return map;
}

export function groupByDay(sessions: Session[]): { date: string; sessions: Session[] }[] {
  const sorted = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
  const groups: { date: string; sessions: Session[] }[] = [];
  for (const s of sorted) {
    const k = dayKey(s.startedAt);
    const last = groups[groups.length - 1];
    if (last && last.date === k) last.sessions.push(s);
    else groups.push({ date: k, sessions: [s] });
  }
  return groups;
}
