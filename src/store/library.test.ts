import {
  LIBRARY_KEY,
  MIGRATIONS_KEY,
  clearCorrupt,
  exportLibrary,
  listCorrupt,
  loadLibrary,
  mergeImport,
  parseImport,
  saveLibrary,
} from './library';
import { FULL_BODY_A, FULL_BODY_B, seedWorkouts } from './seed';
import type { Workout } from '../model/types';
import { validateWorkout } from '../model/segments';
import { memStorage, throwingStorage } from '../test/memStorage';

describe('seedWorkouts', () => {
  it('has the three starting workouts in order', () => {
    expect(seedWorkouts().map((w) => w.name)).toEqual([
      'Full Body A',
      'Full Body B',
      'Kettlebell Rounds (Athenian Complex)',
    ]);
  });

  it('Full Body A and B run 40s on / 20s off through the list, once, after a 30s get ready', () => {
    const [a, b] = seedWorkouts();
    for (const w of [a, b]) {
      expect(w).toMatchObject({ mode: 'interval', prepSeconds: 30, rounds: 1, restBetweenSteps: 20 });
      expect(w.steps).toHaveLength(10);
      expect(w.steps.every((x) => x.kind === 'timed' && x.role === 'work' && x.seconds === 40)).toBe(true);
      expect(validateWorkout(w)).toEqual([]);
    }
  });

  it('the Athenian Complex is a flow: tap once per round, 2:00 rest, until I stop', () => {
    const c = seedWorkouts()[2];
    expect(c).toMatchObject({ mode: 'flow', prepSeconds: 30, rounds: null, advance: 'round', restBetweenRounds: 120 });
    expect(c.steps.every((x) => x.kind === 'tap' && x.role === 'work')).toBe(true);
    expect(validateWorkout(c)).toEqual([]);
  });

  it('Full Body A and B have the exercises from the screenshots', () => {
    const [a, b] = seedWorkouts();
    expect(a.steps.map((s) => s.label)).toEqual([
      'Flat Bench',
      'Reverse Lunge',
      'Deep Press-Ups',
      'Chin Ups',
      'Oblique Dips',
      'B Stance RDL',
      'KB Shoulder Press',
      'Goblet Squat',
      'Bicep Curls',
      'Calf Raises',
    ]);
    expect(b.steps.map((s) => s.label)).toEqual([
      'Offset Squats',
      'Deep Handle Push',
      '1 Arm Rows',
      'Reverse Lunges',
      'Thrusters',
      'Single RDL',
      'KB Shoulder Press',
      'High Pulls',
      'Horn Curls',
      'Weighted Crunches',
    ]);
  });

  it('the Athenian Complex has 9 steps with the right reps', () => {
    const c = seedWorkouts()[2];
    expect(c.steps.map((s) => s.label)).toEqual([
      'Rows',
      'Squats',
      'Cleans',
      'Swings',
      'High Pulls',
      'Snatches',
      'Thrusters',
      'Push Presses',
      'Press Ups',
    ]);
    expect(c.steps.map((s) => s.reps)).toEqual([5, 5, 5, 5, 5, 5, 5, 5, 10]);
  });
});

const oldFlowSeed = (name: string, labels: string[], id: string): Workout => ({
  id,
  name,
  mode: 'flow',
  prepSeconds: 10,
  rounds: null,
  advance: 'round',
  restBetweenRounds: 120,
  steps: labels.map((label, i) => ({ id: `${id}-${i}`, label, kind: 'tap', role: 'work' })),
});

describe('moving untouched old Full Body seeds to 40s/20s', () => {
  it('converts them in place, keeping id and position, and leaves other workouts alone', () => {
    const athenian = seedWorkouts()[2];
    const st = memStorage();
    saveLibrary([oldFlowSeed('Full Body A', FULL_BODY_A, 'idA'), athenian, oldFlowSeed('Full Body B', FULL_BODY_B, 'idB')], st);
    const ws = loadLibrary(st);
    expect(ws.map((w) => [w.id, w.name, w.mode])).toEqual([
      ['idA', 'Full Body A', 'interval'],
      [athenian.id, 'Kettlebell Rounds (Athenian Complex)', 'flow'],
      ['idB', 'Full Body B', 'interval'],
    ]);
    expect(ws[0]).toMatchObject({ rounds: 1, restBetweenSteps: 20 });
    expect(ws[0].steps.map((x) => x.label)).toEqual(FULL_BODY_A);
    expect(ws[1]).toEqual(athenian);
    expect(loadLibrary(st)).toEqual(ws); // stored, and stable on the next load
    expect(listCorrupt(st)).toEqual([]);
  });

  it('does not touch a copy you have edited', () => {
    const edited = { ...oldFlowSeed('Full Body A', FULL_BODY_A, 'idA'), restBetweenRounds: 90 };
    const renamedStep = oldFlowSeed('Full Body B', FULL_BODY_B, 'idB');
    renamedStep.steps[0].label = 'My own first move';
    const st = memStorage({ [MIGRATIONS_KEY]: '["prep-30"]' });
    saveLibrary([edited, renamedStep], st);
    const ws = loadLibrary(st);
    expect(ws[0]).toEqual(edited);
    expect(ws[1]).toEqual(renamedStep);
  });

  it('does not touch a workout of the same name that is not a flow', () => {
    const mine = { ...oldFlowSeed('Full Body A', FULL_BODY_A, 'idA'), mode: 'custom' as const };
    const st = memStorage({ [MIGRATIONS_KEY]: '["prep-30"]' });
    saveLibrary([mine], st);
    expect(loadLibrary(st)[0]).toEqual(mine);
  });
});

describe('30 second get-ready default', () => {
  const withPrep = (w: Workout, prepSeconds: number): Workout => ({ ...w, prepSeconds });

  it('moves workouts still on the old 10s default to 30s, once, and leaves other values alone', () => {
    const [a, b, c] = seedWorkouts();
    const st = memStorage();
    saveLibrary([withPrep(a, 10), withPrep(b, 15), withPrep(c, 0)], st);
    expect(loadLibrary(st).map((w) => w.prepSeconds)).toEqual([30, 15, 0]);
    // you choose 10 yourself afterwards: it must stay 10
    saveLibrary(loadLibrary(st).map((w) => withPrep(w, 10)), st);
    expect(loadLibrary(st).map((w) => w.prepSeconds)).toEqual([10, 10, 10]);
  });

  it('a fresh install is already on 30s and a later 10s choice is kept', () => {
    const st = memStorage();
    expect(loadLibrary(st).map((w) => w.prepSeconds)).toEqual([30, 30, 30]);
    saveLibrary(loadLibrary(st).map((w) => withPrep(w, 10)), st);
    expect(loadLibrary(st).map((w) => w.prepSeconds)).toEqual([10, 10, 10]);
  });
});

describe('restBetweenSteps storage', () => {
  it('a workout with a non-numeric restBetweenSteps is treated as unreadable', () => {
    const bad = { ...seedWorkouts()[0], restBetweenSteps: 'lots' };
    const st = memStorage({ [LIBRARY_KEY]: JSON.stringify([bad]) });
    expect(loadLibrary(st)).toHaveLength(3); // seeds: nothing readable
    expect(listCorrupt(st)).toHaveLength(1);
  });
});

describe('loadLibrary / saveLibrary', () => {
  it('seeds on first launch and keeps the same seeds on the next load', () => {
    const st = memStorage();
    const first = loadLibrary(st);
    expect(first).toHaveLength(3);
    expect(loadLibrary(st).map((w) => w.id)).toEqual(first.map((w) => w.id));
  });

  it('returns what was saved', () => {
    const st = memStorage();
    const ws = seedWorkouts().slice(0, 1);
    saveLibrary(ws, st);
    expect(loadLibrary(st)).toEqual(ws);
  });

  it('an empty saved library stays empty (not re-seeded)', () => {
    const st = memStorage();
    saveLibrary([], st);
    expect(loadLibrary(st)).toEqual([]);
  });

  it('corrupt JSON returns the seeds and keeps a copy of the raw data', () => {
    const st = memStorage({ [LIBRARY_KEY]: '{not json' });
    expect(loadLibrary(st)).toHaveLength(3);
    expect(listCorrupt(st).map((e) => e.raw)).toEqual(['{not json']);
  });

  it('an array where nothing is readable returns the seeds and keeps the raw data', () => {
    const raw = JSON.stringify([{ id: 'x', name: 'No steps' }]);
    const st = memStorage({ [LIBRARY_KEY]: raw });
    expect(loadLibrary(st)).toHaveLength(3);
    expect(listCorrupt(st).map((e) => e.raw)).toEqual([raw]);
  });

  it('keeps the readable workouts when only some are damaged, and sets the damaged data aside', () => {
    const good = seedWorkouts()[0];
    const raw = JSON.stringify([good, { id: 'broken' }, seedWorkouts()[1]]);
    const st = memStorage({ [LIBRARY_KEY]: raw });
    const ws = loadLibrary(st);
    expect(ws.map((w) => w.name)).toEqual(['Full Body A', 'Full Body B']);
    expect(listCorrupt(st).map((e) => e.raw)).toEqual([raw]);
    expect(loadLibrary(st)).toEqual(ws); // and it is stable on the next load
    expect(listCorrupt(st)).toHaveLength(1);
  });

  it('a second corruption does not overwrite the first copy', () => {
    const st = memStorage({ [LIBRARY_KEY]: '{first' });
    loadLibrary(st);
    st.setItem(LIBRARY_KEY, '{second');
    loadLibrary(st);
    expect(listCorrupt(st).map((e) => e.raw)).toEqual(['{first', '{second']);
  });

  it('keeps at most the 5 most recent unreadable copies', () => {
    const st = memStorage();
    for (let i = 1; i <= 7; i++) {
      st.setItem(LIBRARY_KEY, `{bad${i}`);
      loadLibrary(st);
    }
    expect(listCorrupt(st).map((e) => e.raw)).toEqual(['{bad3', '{bad4', '{bad5', '{bad6', '{bad7']);
  });

  it('clearCorrupt removes the saved copies', () => {
    const st = memStorage({ [LIBRARY_KEY]: '{bad' });
    loadLibrary(st);
    clearCorrupt(st);
    expect(listCorrupt(st)).toEqual([]);
  });

  it('does not throw when storage itself is unavailable', () => {
    expect(loadLibrary(throwingStorage())).toHaveLength(3);
    expect(() => saveLibrary(seedWorkouts(), throwingStorage())).not.toThrow();
  });
});

describe('export / import', () => {
  it('round trips', () => {
    const ws = seedWorkouts();
    const out = parseImport(exportLibrary(ws));
    expect(out).toEqual({ ok: true, workouts: ws });
  });

  it.each([
    ['non-JSON', 'hello'],
    ['a wrong app field', JSON.stringify({ app: 'other', version: 1, workouts: [] })],
    ['workouts that are not an array', JSON.stringify({ app: 'workout-timer', version: 1, workouts: 5 })],
    ['a wrong-shape workout', JSON.stringify({ app: 'workout-timer', version: 1, workouts: [{ id: 'a' }] })],
  ])('rejects %s', (_label, text) => {
    const out = parseImport(text);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.length).toBeGreaterThan(0);
  });

  it('rejects workouts that fail validation, naming the workout', () => {
    const bad = seedWorkouts()[0];
    bad.steps = [];
    const out = parseImport(exportLibrary([bad]));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('Full Body A');
  });

  it('a failed import does not touch stored data', () => {
    const st = memStorage();
    saveLibrary(seedWorkouts(), st);
    const before = st.getItem(LIBRARY_KEY);
    parseImport('hello');
    expect(st.getItem(LIBRARY_KEY)).toBe(before);
  });

  it('mergeImport keeps everything and re-ids colliding workouts', () => {
    const existing = seedWorkouts();
    const incoming = [{ ...existing[0] }, { ...seedWorkouts()[1], id: 'brand-new' }];
    const merged = mergeImport(existing, incoming);
    expect(merged).toHaveLength(5);
    expect(merged.slice(0, 3)).toEqual(existing);
    expect(new Set(merged.map((w) => w.id)).size).toBe(5);
    expect(merged[4].id).toBe('brand-new');
  });
});
