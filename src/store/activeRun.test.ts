import { ACTIVE_RUN_KEY, clearActiveRun, loadActiveRun, saveActiveRun } from './activeRun';
import { startRun } from '../engine/runner';
import { seedWorkouts } from './seed';
import { memStorage, throwingStorage } from '../test/memStorage';

const run = () => startRun(seedWorkouts()[0], 1_000);

describe('activeRun store', () => {
  it('round trips a run', () => {
    const st = memStorage();
    const r = run();
    saveActiveRun(r, st, 5_000);
    expect(loadActiveRun(st, 6_000)).toEqual(r);
  });

  it('is empty when nothing was saved, and after clear', () => {
    const st = memStorage();
    expect(loadActiveRun(st)).toBeNull();
    saveActiveRun(run(), st);
    clearActiveRun(st);
    expect(loadActiveRun(st)).toBeNull();
  });

  it('ignores and removes a run saved more than 6 hours ago', () => {
    const st = memStorage();
    saveActiveRun(run(), st, 0);
    expect(loadActiveRun(st, 6 * 3600_000 + 1)).toBeNull();
    expect(st.getItem(ACTIVE_RUN_KEY)).toBeNull();
  });

  it('ignores corrupt or wrong-shape data', () => {
    expect(loadActiveRun(memStorage({ [ACTIVE_RUN_KEY]: '{nope' }))).toBeNull();
    expect(loadActiveRun(memStorage({ [ACTIVE_RUN_KEY]: JSON.stringify({ savedAt: 1, state: { index: 'x' } }) }), 2)).toBeNull();
    expect(loadActiveRun(memStorage({ [ACTIVE_RUN_KEY]: JSON.stringify({ savedAt: 1, state: { ...run(), index: 99 } }) }), 2)).toBeNull();
  });

  it('ignores a finished run', () => {
    const st = memStorage();
    saveActiveRun({ ...run(), finished: true }, st);
    expect(loadActiveRun(st)).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    expect(loadActiveRun(throwingStorage())).toBeNull();
    expect(() => saveActiveRun(run(), throwingStorage())).not.toThrow();
    expect(() => clearActiveRun(throwingStorage())).not.toThrow();
  });
});
