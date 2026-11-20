import { summarize, type RunState } from '../engine/runner';
import type { Mode } from '../model/types';

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
    (s.note === undefined || typeof s.note === 'string')
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

export function removeSession(id: string, storage: Storage | undefined = defaultStorage()): Session[] {
  const next = loadHistory(storage).filter((s) => s.id !== id);
  saveHistory(next, storage);
  return next;
}

/** The session for a run. The id is stable per run, so logging the same run twice is harmless. */
export function sessionFromRun(run: RunState, now: number, completed: boolean = run.finished): Session {
  const sum = summarize(run, now);
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
  };
}
