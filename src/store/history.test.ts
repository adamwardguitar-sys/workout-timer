import {
  HISTORY_CORRUPT_KEY,
  HISTORY_KEY,
  addSession,
  importSessions,
  loadHistory,
  removeSession,
  saveHistory,
  setNote,
  setWeights,
  sessionFromRun,
  trackedExercises,
  type Session,
} from './history';
import { startRun } from '../engine/runner';
import type { Workout } from '../model/types';
import { memStorage, throwingStorage } from '../test/memStorage';

const sess = (over: Partial<Session> = {}): Session => ({
  id: 's1',
  workoutId: 'w1',
  workoutName: 'Full Body A',
  mode: 'interval',
  startedAt: 1_700_000_000_000,
  durationSec: 600,
  roundsDone: 1,
  laps: 0,
  completed: true,
  ...over,
});

describe('history store', () => {
  it('starts empty', () => {
    expect(loadHistory(memStorage())).toEqual([]);
  });

  it('round trips sessions', () => {
    const st = memStorage();
    saveHistory([sess(), sess({ id: 's2', note: 'felt strong' })], st);
    expect(loadHistory(st)).toEqual([sess(), sess({ id: 's2', note: 'felt strong' })]);
  });

  it('addSession appends and persists', () => {
    const st = memStorage();
    const out = addSession(sess(), st);
    expect(out).toHaveLength(1);
    expect(loadHistory(st)).toHaveLength(1);
    expect(addSession(sess({ id: 's2' }), st)).toHaveLength(2);
  });

  it('addSession ignores a duplicate id (a run is only ever logged once)', () => {
    const st = memStorage();
    addSession(sess(), st);
    expect(addSession(sess({ durationSec: 1 }), st)).toHaveLength(1);
    expect(loadHistory(st)[0].durationSec).toBe(600);
  });

  it('setNote sets and clears a note', () => {
    const st = memStorage();
    addSession(sess(), st);
    expect(setNote('s1', '  heavy day  ', st)[0].note).toBe('heavy day');
    expect(setNote('s1', '   ', st)[0].note).toBeUndefined();
  });

  it('removeSession deletes by id', () => {
    const st = memStorage();
    addSession(sess(), st);
    addSession(sess({ id: 's2' }), st);
    expect(removeSession('s1', st).map((s) => s.id)).toEqual(['s2']);
    expect(loadHistory(st).map((s) => s.id)).toEqual(['s2']);
  });

  it('keeps readable sessions and sets unreadable data aside instead of losing it', () => {
    const raw = JSON.stringify([sess(), { id: 'bad' }, sess({ id: 's3' })]);
    const st = memStorage({ [HISTORY_KEY]: raw });
    expect(loadHistory(st).map((s) => s.id)).toEqual(['s1', 's3']);
    expect(st.getItem(HISTORY_CORRUPT_KEY)).toBe(raw);
  });

  it('corrupt JSON gives an empty history and keeps the raw copy', () => {
    const st = memStorage({ [HISTORY_KEY]: '{nope' });
    expect(loadHistory(st)).toEqual([]);
    expect(st.getItem(HISTORY_CORRUPT_KEY)).toBe('{nope');
  });

  it('does not throw when storage is unavailable', () => {
    expect(loadHistory(throwingStorage())).toEqual([]);
    expect(() => addSession(sess(), throwingStorage())).not.toThrow();
  });

  it('importSessions adds only sessions it does not already have and reports how many', () => {
    const st = memStorage();
    addSession(sess(), st);
    const out = importSessions([sess(), sess({ id: 's2' }), sess({ id: 's3' })], st);
    expect(out.added).toBe(2);
    expect(loadHistory(st).map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(importSessions([sess({ id: 's2' })], st).added).toBe(0);
  });

  it('setWeights stores positive weights with the unit, drops blanks and zeros, and clears when none are left', () => {
    const st = memStorage();
    addSession(sess(), st);
    const out = setWeights(
      's1',
      [
        { exercise: 'Goblet Squat', value: 16 },
        { exercise: 'Bicep Curls', value: 0 },
        { exercise: '  ', value: 5 },
        { exercise: 'Flat Bench', value: 22.5 },
      ],
      'kg',
      st,
    );
    expect(out[0].weights).toEqual([
      { exercise: 'Goblet Squat', value: 16 },
      { exercise: 'Flat Bench', value: 22.5 },
    ]);
    expect(out[0].unit).toBe('kg');
    const cleared = setWeights('s1', [], 'kg', st);
    expect(cleared[0].weights).toBeUndefined();
    expect(cleared[0].unit).toBeUndefined();
  });

  it('accepts sessions with the optional tracking fields and rejects malformed ones', () => {
    const good = sess({ tracked: ['A'], weights: [{ exercise: 'A', value: 10 }], unit: 'lb' });
    const st = memStorage();
    saveHistory([good], st);
    expect(loadHistory(st)).toEqual([good]);
    const bad = { ...sess({ id: 'b' }), weights: [{ exercise: 'A', value: 'heavy' }] };
    const st2 = memStorage({ [HISTORY_KEY]: JSON.stringify([bad]) });
    expect(loadHistory(st2)).toEqual([]);
  });
});

describe('weight tracking from a run', () => {
  const w: Workout = {
    id: 'w',
    name: 'W',
    mode: 'interval',
    prepSeconds: 0,
    rounds: 1,
    advance: 'step',
    restBetweenRounds: 0,
    steps: [
      { id: '1', label: 'Goblet Squat', kind: 'timed', role: 'work', seconds: 40, weighted: true },
      { id: '2', label: 'Chin Ups', kind: 'timed', role: 'work', seconds: 40 },
      { id: '3', label: 'Rest', kind: 'timed', role: 'rest', seconds: 20, weighted: true },
      { id: '4', label: ' Goblet Squat ', kind: 'timed', role: 'work', seconds: 40, weighted: true },
      { id: '5', label: 'Bicep Curls', kind: 'timed', role: 'work', seconds: 40, weighted: true },
    ],
  };

  it('trackedExercises lists each weighted work exercise once, in order', () => {
    expect(trackedExercises(w)).toEqual(['Goblet Squat', 'Bicep Curls']);
  });

  it('a logged session remembers which exercises could be weighed', () => {
    expect(sessionFromRun(startRun(w, 0), 1000).tracked).toEqual(['Goblet Squat', 'Bicep Curls']);
    const none = { ...w, steps: w.steps.map((x) => ({ ...x, weighted: false })) };
    expect(sessionFromRun(startRun(none, 0), 1000).tracked).toBeUndefined();
  });
});
