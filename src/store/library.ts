import { newId } from '../model/id';
import { validateWorkout } from '../model/segments';
import type { Workout } from '../model/types';
import { seedWorkouts } from './seed';

export const LIBRARY_KEY = 'workout-timer:library:v1';
export const CORRUPT_KEY = 'workout-timer:library:corrupt';

const MODES = ['interval', 'tabata', 'emom', 'amrap', 'flow', 'custom'];
const optNum = (v: unknown) => v === undefined || typeof v === 'number';

function isStep(x: unknown): boolean {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.label === 'string' &&
    (s.kind === 'timed' || s.kind === 'tap') &&
    (s.role === 'work' || s.role === 'rest') &&
    optNum(s.seconds) &&
    optNum(s.reps)
  );
}

export function isWorkout(x: unknown): x is Workout {
  if (typeof x !== 'object' || x === null) return false;
  const w = x as Record<string, unknown>;
  return (
    typeof w.id === 'string' &&
    typeof w.name === 'string' &&
    typeof w.mode === 'string' &&
    MODES.includes(w.mode) &&
    typeof w.prepSeconds === 'number' &&
    Array.isArray(w.steps) &&
    w.steps.every(isStep) &&
    (w.rounds === null || typeof w.rounds === 'number') &&
    (w.advance === 'step' || w.advance === 'round') &&
    typeof w.restBetweenRounds === 'number'
  );
}

function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function saveLibrary(ws: Workout[], storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(LIBRARY_KEY, JSON.stringify(ws));
  } catch {
    /* storage full or unavailable: keep running with in-memory state */
  }
}

export interface CorruptEntry {
  savedAt: number;
  raw: string;
}

const MAX_CORRUPT = 5;

/** Unreadable library data we set aside instead of throwing away, oldest first. */
export function listCorrupt(storage: Storage | undefined = defaultStorage()): CorruptEntry[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(CORRUPT_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is CorruptEntry =>
        typeof e === 'object' && e !== null && typeof e.savedAt === 'number' && typeof e.raw === 'string',
    );
  } catch {
    return [];
  }
}

function addCorrupt(raw: string, storage: Storage | undefined): void {
  try {
    const next = [...listCorrupt(storage), { savedAt: Date.now(), raw }].slice(-MAX_CORRUPT);
    storage?.setItem(CORRUPT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function clearCorrupt(storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.removeItem(CORRUPT_KEY);
  } catch {
    /* ignore */
  }
}

export function loadLibrary(storage: Storage | undefined = defaultStorage()): Workout[] {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(LIBRARY_KEY) ?? null;
  } catch {
    return seedWorkouts();
  }
  if (raw === null) {
    const seeds = seedWorkouts();
    saveLibrary(seeds, storage);
    return seeds;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(isWorkout);
      if (valid.length === parsed.length) return valid;
      if (valid.length > 0) {
        // keep what is readable, set the rest aside so nothing is silently lost
        addCorrupt(raw, storage);
        saveLibrary(valid, storage);
        return valid;
      }
    }
  } catch {
    /* fall through to the unreadable path */
  }
  addCorrupt(raw, storage);
  const seeds = seedWorkouts();
  saveLibrary(seeds, storage);
  return seeds;
}

export function exportLibrary(ws: Workout[]): string {
  return JSON.stringify({ app: 'workout-timer', version: 1, workouts: ws }, null, 2);
}

export type ImportResult = { ok: true; workouts: Workout[] } | { ok: false; error: string };

export function parseImport(json: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  const d = data as { app?: unknown; workouts?: unknown } | null;
  if (typeof d !== 'object' || d === null || d.app !== 'workout-timer') {
    return { ok: false, error: 'That file is not a Workout Timer backup.' };
  }
  if (!Array.isArray(d.workouts) || !d.workouts.every(isWorkout)) {
    return { ok: false, error: 'The workouts in that file are not in the expected format.' };
  }
  for (const w of d.workouts) {
    const problems = validateWorkout(w);
    if (problems.length > 0) return { ok: false, error: `"${w.name}" is invalid: ${problems[0]}` };
  }
  return { ok: true, workouts: d.workouts };
}

export function mergeImport(existing: Workout[], incoming: Workout[]): Workout[] {
  const used = new Set(existing.map((w) => w.id));
  const added = incoming.map((w) => {
    const id = used.has(w.id) ? newId() : w.id;
    used.add(id);
    return { ...w, id };
  });
  return [...existing, ...added];
}
