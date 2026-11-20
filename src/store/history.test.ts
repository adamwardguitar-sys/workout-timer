import {
  HISTORY_CORRUPT_KEY,
  HISTORY_KEY,
  addSession,
  loadHistory,
  removeSession,
  saveHistory,
  setNote,
  type Session,
} from './history';
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
});
