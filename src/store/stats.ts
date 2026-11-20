import type { Session, WeightUnit } from './history';

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

export interface WeightPoint {
  value: number;
  unit: WeightUnit;
  at: number;
}

export interface ExerciseProgress {
  exercise: string;
  latest: WeightPoint;
  /** Every logged weight in the latest unit, oldest first (for charting). */
  points: WeightPoint[];
  /** The most recent earlier weight that was different (same unit), if any. */
  previous?: WeightPoint;
}

/** Every logged weight, oldest first, grouped by exercise name (case-insensitive). */
function weightHistory(sessions: Session[]): Map<string, { exercise: string; points: WeightPoint[] }> {
  const map = new Map<string, { exercise: string; points: WeightPoint[] }>();
  const ordered = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  for (const s of ordered) {
    for (const w of s.weights ?? []) {
      const key = w.exercise.trim().toLowerCase();
      const entry = map.get(key) ?? { exercise: w.exercise.trim(), points: [] };
      entry.exercise = w.exercise.trim(); // keep the most recent spelling
      entry.points.push({ value: w.value, unit: s.unit ?? 'kg', at: s.startedAt });
      map.set(key, entry);
    }
  }
  return map;
}

/** The most recent weight for each exercise, keyed by lower-case name. */
export function lastWeights(sessions: Session[]): Map<string, WeightPoint & { exercise: string }> {
  const out = new Map<string, WeightPoint & { exercise: string }>();
  for (const [key, e] of weightHistory(sessions)) out.set(key, { exercise: e.exercise, ...e.points[e.points.length - 1] });
  return out;
}

/** Latest weight per exercise and how it changed, most recently used first. */
export function exerciseProgress(sessions: Session[]): ExerciseProgress[] {
  const rows: ExerciseProgress[] = [];
  for (const e of weightHistory(sessions).values()) {
    const latest = e.points[e.points.length - 1];
    const previous = [...e.points]
      .reverse()
      .slice(1)
      .find((p) => p.unit === latest.unit && p.value !== latest.value);
    const points = e.points.filter((p) => p.unit === latest.unit);
    rows.push({ exercise: e.exercise, latest, points, ...(previous ? { previous } : {}) });
  }
  return rows.sort((a, b) => b.latest.at - a.latest.at);
}
