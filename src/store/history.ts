import { summarize, type RunState } from '../engine/runner';
import { newId } from '../model/id';
import type { Mode, Workout } from '../model/types';

export type WeightUnit = 'kg' | 'lb';

export interface ExerciseWeight {
  exercise: string;
  value: number;
}

/** One logged workout. Times are ms since the epoch; durations are active seconds. */
export interface Session {
  id: string;
  workoutId: string;
  workoutName: string;
  mode: Mode;
  startedAt: number;
  durationSec: number;
  roundsDone: number;
  laps: number;
  /** True only if the workout ran to its end; false means you stopped it early. */
  completed: boolean;
  note?: string;
  /** Logged by hand (e.g. a run) rather than recorded by the timer. */
  manual?: boolean;
  /** Exercises that could be weighed in this workout (those with Track weight ticked). */
  tracked?: string[];
  weights?: ExerciseWeight[];
  unit?: WeightUnit;
}

/** Ending a workout sooner than this is treated as an accidental start and not logged. */
export const MIN_LOGGED_SECONDS = 30;

export const HISTORY_KEY = 'workout-timer:history:v1';
export const HISTORY_CORRUPT_KEY = 'workout-timer:history:corrupt';

const MODES = ['interval', 'tabata', 'emom', 'amrap', 'flow', 'custom'];

export function isSession(x: unknown): x is Session {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.workoutId === 'string' &&
    typeof s.workoutName === 'string' &&
    typeof s.mode === 'string' &&
    MODES.includes(s.mode) &&
    typeof s.startedAt === 'number' &&
    typeof s.durationSec === 'number' &&
    typeof s.roundsDone === 'number' &&
    typeof s.laps === 'number' &&
    typeof s.completed === 'boolean' &&
    (s.note === undefined || typeof s.note === 'string') &&
    (s.manual === undefined || typeof s.manual === 'boolean') &&
    (s.tracked === undefined || (Array.isArray(s.tracked) && s.tracked.every((t) => typeof t === 'string'))) &&
    (s.unit === undefined || s.unit === 'kg' || s.unit === 'lb') &&
    (s.weights === undefined ||
      (Array.isArray(s.weights) &&
        s.weights.every(
          (w) =>
            typeof w === 'object' &&
            w !== null &&
            typeof (w as ExerciseWeight).exercise === 'string' &&
            typeof (w as ExerciseWeight).value === 'number',
        )))
  );
}

function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function saveHistory(list: Session[], storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    /* storage full or unavailable */
  }
}

function setAside(raw: string, storage: Storage | undefined): void {
  try {
    if (storage && storage.getItem(HISTORY_CORRUPT_KEY) === null) storage.setItem(HISTORY_CORRUPT_KEY, raw);
  } catch {
    /* ignore */
  }
}

export function loadHistory(storage: Storage | undefined = defaultStorage()): Session[] {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(HISTORY_KEY) ?? null;
  } catch {
    return [];
  }
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(isSession);
      if (valid.length !== parsed.length) {
        setAside(raw, storage);
        saveHistory(valid, storage);
      }
      return valid;
    }
  } catch {
    /* unreadable */
  }
  setAside(raw, storage);
  return [];
}

export function addSession(s: Session, storage: Storage | undefined = defaultStorage()): Session[] {
  const list = loadHistory(storage);
  if (list.some((x) => x.id === s.id)) return list;
  const next = [...list, s];
  saveHistory(next, storage);
  return next;
}

/** Adds the sessions you do not already have (matched by id). */
export function importSessions(
  incoming: Session[],
  storage: Storage | undefined = defaultStorage(),
): { added: number; sessions: Session[] } {
  const list = loadHistory(storage);
  const have = new Set(list.map((s) => s.id));
  const fresh = incoming.filter((s) => !have.has(s.id));
  const next = [...list, ...fresh];
  if (fresh.length > 0) saveHistory(next, storage);
  return { added: fresh.length, sessions: next };
}

export function setNote(id: string, note: string, storage: Storage | undefined = defaultStorage()): Session[] {
  const trimmed = note.trim();
  const next = loadHistory(storage).map((s) => {
    if (s.id !== id) return s;
    const { note: _old, ...rest } = s;
    void _old;
    return trimmed ? { ...rest, note: trimmed } : rest;
  });
  saveHistory(next, storage);
  return next;
}

/** Stores the weights for a session. Blank, zero and nameless entries are dropped; none left clears them. */
export function setWeights(
  id: string,
  weights: ExerciseWeight[],
  unit: WeightUnit,
  storage: Storage | undefined = defaultStorage(),
): Session[] {
  const clean = weights
    .filter((w) => w.exercise.trim() && Number.isFinite(w.value) && w.value > 0)
    .map((w) => ({ exercise: w.exercise, value: w.value }));
  const next = loadHistory(storage).map((s) => {
    if (s.id !== id) return s;
    const { weights: _w, unit: _u, ...rest } = s;
    void _w;
    void _u;
    return clean.length > 0 ? { ...rest, weights: clean, unit } : rest;
  });
  saveHistory(next, storage);
  return next;
}

/** A run logged with one tap: today's date, no time yet (it can be added in History). */
export function makeManualRun(now: number): Session {
  return {
    id: `run-${newId()}`,
    workoutId: 'run',
    workoutName: 'Run',
    mode: 'custom',
    startedAt: now,
    durationSec: 0,
    roundsDone: 0,
    laps: 0,
    completed: true,
    manual: true,
  };
}

export function setDuration(id: string, seconds: number, storage: Storage | undefined = defaultStorage()): Session[] {
  const secs = Math.max(0, Math.round(seconds));
  const next = loadHistory(storage).map((s) => (s.id === id ? { ...s, durationSec: secs } : s));
  saveHistory(next, storage);
  return next;
}

export function removeSession(id: string, storage: Storage | undefined = defaultStorage()): Session[] {
  const next = loadHistory(storage).filter((s) => s.id !== id);
  saveHistory(next, storage);
  return next;
}

/** The exercises to ask a weight for: weighted work steps, each name once, in order. */
export function trackedExercises(workout: Workout): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const st of workout.steps) {
    const name = st.label.trim();
    if (st.weighted && st.role === 'work' && name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out;
}

/** The session for a run. The id is stable per run, so logging the same run twice is harmless. */
export function sessionFromRun(run: RunState, now: number, completed: boolean = run.finished): Session {
  const sum = summarize(run, now);
  const tracked = trackedExercises(run.workout);
  return {
    id: `${run.workout.id}-${run.startedAt}`,
    workoutId: run.workout.id,
    workoutName: run.workout.name.trim() || 'Untitled',
    mode: run.workout.mode,
    startedAt: run.startedAt,
    durationSec: sum.durationSec,
    roundsDone: sum.roundsDone,
    laps: sum.laps,
    completed,
    ...(tracked.length > 0 ? { tracked } : {}),
  };
}
