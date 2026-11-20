import {
  CORRUPT_KEY,
  LIBRARY_KEY,
  exportLibrary,
  loadLibrary,
  mergeImport,
  parseImport,
  saveLibrary,
} from './library';
import { seedWorkouts } from './seed';
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

  it('are all flow workouts: tap steps, 10s get ready, 2:00 rest, until I stop', () => {
    for (const w of seedWorkouts()) {
      expect(w).toMatchObject({
        mode: 'flow',
        prepSeconds: 10,
        restBetweenRounds: 120,
        rounds: null,
        advance: 'round',
      });
      expect(w.steps.every((s) => s.kind === 'tap' && s.role === 'work')).toBe(true);
      expect(validateWorkout(w)).toEqual([]);
    }
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
    const ws = loadLibrary(st);
    expect(ws).toHaveLength(3);
    expect(st.getItem(CORRUPT_KEY)).toBe('{not json');
  });

  it('a wrong-shape array is treated as corrupt', () => {
    const raw = JSON.stringify([{ id: 'x', name: 'No steps' }]);
    const st = memStorage({ [LIBRARY_KEY]: raw });
    expect(loadLibrary(st)).toHaveLength(3);
    expect(st.getItem(CORRUPT_KEY)).toBe(raw);
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
