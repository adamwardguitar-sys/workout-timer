import { update, type RunState } from '../engine/runner';
import { addSession, sessionFromRun } from './history';
import { isWorkout } from './library';

export const ACTIVE_RUN_KEY = 'workout-timer:active-run';
export const MAX_AGE_MS = 6 * 60 * 60 * 1000;

function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function saveActiveRun(
  state: RunState,
  storage: Storage | undefined = defaultStorage(),
  now: number = Date.now(),
): void {
  try {
    storage?.setItem(ACTIVE_RUN_KEY, JSON.stringify({ savedAt: now, state }));
  } catch {
    /* ignore */
  }
}

export function clearActiveRun(storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.removeItem(ACTIVE_RUN_KEY);
  } catch {
    /* ignore */
  }
}

function isRunState(x: unknown): x is RunState {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    isWorkout(s.workout) &&
    Array.isArray(s.segments) &&
    s.segments.length > 0 &&
    typeof s.index === 'number' &&
    Number.isInteger(s.index) &&
    s.index >= 0 &&
    s.index < s.segments.length &&
    typeof s.round === 'number' &&
    typeof s.segmentStart === 'number' &&
    (s.startedAt === undefined || typeof s.startedAt === 'number') &&
    (s.pausedMs === undefined || typeof s.pausedMs === 'number') &&
    (s.pausedAt === null || typeof s.pausedAt === 'number') &&
    (s.lastCountdown === null || typeof s.lastCountdown === 'number') &&
    typeof s.laps === 'number' &&
    typeof s.finished === 'boolean' &&
    typeof s.beepSeconds === 'number'
  );
}

/** The saved, unfinished run, or null (also null, and cleared, when it is too old or unreadable). */
export function loadActiveRun(
  storage: Storage | undefined = defaultStorage(),
  now: number = Date.now(),
): RunState | null {
  try {
    const raw = storage?.getItem(ACTIVE_RUN_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { savedAt?: unknown; state?: unknown };
    if (
      typeof saved.savedAt !== 'number' ||
      now - saved.savedAt > MAX_AGE_MS ||
      !isRunState(saved.state) ||
      saved.state.finished
    ) {
      clearActiveRun(storage);
      return null;
    }
    // runs saved before time tracking existed have no start time: use the current segment's start
    const st = saved.state;
    const run = { ...st, startedAt: st.startedAt ?? st.segmentStart, pausedMs: st.pausedMs ?? 0 };
    if (run.pausedAt === null) {
      const fast = update(run, now);
      if (fast.state.finished) {
        // it ran to the end while the app was closed: keep it in the history, once
        addSession(sessionFromRun(fast.state, now), storage);
        clearActiveRun(storage);
        return null;
      }
    }
    return run;
  } catch {
    return null;
  }
}
