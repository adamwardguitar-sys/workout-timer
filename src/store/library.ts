import { newId } from '../model/id';
import { validateWorkout } from '../model/segments';
import type { Workout } from '../model/types';
import { isSession, type Session } from './history';
import {
  ATHENIAN_LABELS,
  FULL_BODY_A,
  FULL_BODY_B,
  WEIGHTED_A,
  WEIGHTED_ATHENIAN,
  WEIGHTED_B,
  seedWorkouts,
} from './seed';

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
    optNum(s.reps) &&
    (s.weighted === undefined || typeof s.weighted === 'boolean')
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
    typeof w.restBetweenRounds === 'number' &&
    optNum(w.restBetweenSteps) &&
    (w.waitBetweenRounds === undefined || typeof w.waitBetweenRounds === 'boolean')
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

/**
 * Full Body A/B first shipped as tap-through flows. They are 40s on / 20s off lists, so an
 * untouched copy of the old version is replaced in place (same id and position); anything
 * you have edited is left exactly as it is.
 */
const OLD_FLOW_SEEDS: Record<string, string[]> = { 'Full Body A': FULL_BODY_A, 'Full Body B': FULL_BODY_B };

function isUntouchedOldFlowSeed(w: Workout): boolean {
  const labels = OLD_FLOW_SEEDS[w.name];
  return (
    labels !== undefined &&
    w.mode === 'flow' &&
    w.prepSeconds === 10 &&
    w.rounds === null &&
    w.advance === 'round' &&
    w.restBetweenRounds === 120 &&
    w.restBetweenSteps === undefined &&
    w.steps.length === labels.length &&
    w.steps.every((s, i) => s.kind === 'tap' && s.role === 'work' && s.reps === undefined && s.label === labels[i])
  );
}

function migrateOldSeeds(ws: Workout[]): { workouts: Workout[]; changed: boolean } {
  let changed = false;
  const fresh = seedWorkouts();
  const workouts = ws.map((w) => {
    if (!isUntouchedOldFlowSeed(w)) return w;
    const replacement = fresh.find((f) => f.name === w.name);
    if (!replacement) return w;
    changed = true;
    return { ...replacement, id: w.id };
  });
  return { workouts, changed };
}

export const MIGRATIONS_KEY = 'workout-timer:migrations:v1';

function readFlags(storage: Storage | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(MIGRATIONS_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function writeFlags(flags: string[], storage: Storage | undefined): void {
  try {
    storage?.setItem(MIGRATIONS_KEY, JSON.stringify(flags));
  } catch {
    /* ignore */
  }
}

const ALL_MIGRATIONS = ['prep-30', 'weights-1'];

/** Runs `fix` over the library the first time only, so a later choice of yours is never undone. */
function runOnce(
  flag: string,
  ws: Workout[],
  storage: Storage | undefined,
  fix: (ws: Workout[]) => Workout[],
): { workouts: Workout[]; changed: boolean } {
  const flags = readFlags(storage);
  if (flags.includes(flag)) return { workouts: ws, changed: false };
  const workouts = fix(ws);
  writeFlags([...flags, flag], storage);
  return { workouts, changed: workouts.some((w, i) => w !== ws[i]) };
}

/** Fresh installs already have the current defaults: just record that nothing needs migrating. */
function markAllMigrated(storage: Storage | undefined): void {
  writeFlags([...new Set([...readFlags(storage), ...ALL_MIGRATIONS])], storage);
}

/** The default get-ready went from 10s to 30s: move workouts still on the old default. */
const fixPrep30 = (ws: Workout[]): Workout[] => ws.map((w) => (w.prepSeconds === 10 ? { ...w, prepSeconds: 30 } : w));

const SEED_WEIGHTS: Record<string, { labels: string[]; weighted: string[] }> = {
  'Full Body A': { labels: FULL_BODY_A, weighted: WEIGHTED_A },
  'Full Body B': { labels: FULL_BODY_B, weighted: WEIGHTED_B },
  'Kettlebell Rounds (Athenian Complex)': { labels: ATHENIAN_LABELS, weighted: WEIGHTED_ATHENIAN },
};

/** Tick "Track weight" on the starter workouts' weighted exercises (only where you have not chosen). */
function fixWeights(ws: Workout[]): Workout[] {
  return ws.map((w) => {
    const seed = SEED_WEIGHTS[w.name];
    if (!seed || w.steps.length !== seed.labels.length || !w.steps.every((s, i) => s.label === seed.labels[i])) return w;
    const steps = w.steps.map((s) => (s.weighted === undefined && seed.weighted.includes(s.label) ? { ...s, weighted: true } : s));
    return steps.some((s, i) => s !== w.steps[i]) ? { ...w, steps } : w;
  });
}

function upgrade(ws: Workout[], storage: Storage | undefined): Workout[] {
  const a = migrateOldSeeds(ws);
  const b = runOnce('prep-30', a.workouts, storage, fixPrep30);
  const c = runOnce('weights-1', b.workouts, storage, fixWeights);
  if (a.changed || b.changed || c.changed) saveLibrary(c.workouts, storage);
  return c.workouts;
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
    markAllMigrated(storage);
    return seeds;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(isWorkout);
      if (valid.length === parsed.length) return upgrade(valid, storage);
      if (valid.length > 0) {
        // keep what is readable, set the rest aside so nothing is silently lost
        addCorrupt(raw, storage);
        const kept = upgrade(valid, storage);
        saveLibrary(kept, storage);
        return kept;
      }
    }
  } catch {
    /* fall through to the unreadable path */
  }
  addCorrupt(raw, storage);
  const seeds = seedWorkouts();
  saveLibrary(seeds, storage);
  markAllMigrated(storage);
  return seeds;
}

export function exportLibrary(ws: Workout[], history: Session[] = []): string {
  return JSON.stringify({ app: 'workout-timer', version: 2, workouts: ws, history }, null, 2);
}

export type ImportResult = { ok: true; workouts: Workout[]; history: Session[] } | { ok: false; error: string };

export function parseImport(json: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  const d = data as { app?: unknown; workouts?: unknown; history?: unknown } | null;
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
  // older backups (version 1) have no history
  const history = d.history ?? [];
  if (!Array.isArray(history) || !history.every(isSession)) {
    return { ok: false, error: 'The history in that file is not in the expected format.' };
  }
  return { ok: true, workouts: d.workouts, history };
}

/** What makes two workouts "the same" for import: everything except the ids. */
function contentKey(w: Workout): string {
  return JSON.stringify({ ...w, id: undefined, steps: w.steps.map((x) => ({ ...x, id: undefined })) });
}

/** Adds the workouts you do not already have (compared by content, so re-importing a backup adds nothing). */
export function mergeImport(existing: Workout[], incoming: Workout[]): Workout[] {
  const used = new Set(existing.map((w) => w.id));
  const seen = new Set(existing.map(contentKey));
  const added: Workout[] = [];
  for (const w of incoming) {
    const key = contentKey(w);
    if (seen.has(key)) continue;
    seen.add(key);
    const id = used.has(w.id) ? newId() : w.id;
    used.add(id);
    added.push({ ...w, id });
  }
  return added.length > 0 ? [...existing, ...added] : existing;
}
