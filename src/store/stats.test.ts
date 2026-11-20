import { activityGrid, exerciseProgress, groupByDay, lastWeights, thisWeek, workoutStats } from './stats';
import type { Session } from './history';

// Local-time dates so the tests do not depend on the machine's timezone.
const at = (m: number, d: number, h = 9) => new Date(2026, m - 1, d, h, 0).getTime();
const NOW = at(11, 20, 12); // Friday 20 Nov 2026; that week started Monday 16 Nov

const sess = (id: string, startedAt: number, durationSec = 600, workoutId = 'w1'): Session => ({
  id,
  workoutId,
  workoutName: workoutId === 'w1' ? 'Full Body A' : 'Kettle',
  mode: 'interval',
  startedAt,
  durationSec,
  roundsDone: 1,
  laps: 0,
  completed: true,
});

describe('thisWeek', () => {
  it('counts sessions and minutes since Monday only', () => {
    const list = [sess('a', at(11, 16), 600), sess('b', at(11, 18), 1200), sess('c', at(11, 15), 999)];
    expect(thisWeek(list, NOW)).toEqual({ sessions: 2, seconds: 1800 });
  });
  it('is zero with no sessions', () => {
    expect(thisWeek([], NOW)).toEqual({ sessions: 0, seconds: 0 });
  });
});

describe('activityGrid', () => {
  it('is 4 Monday-to-Sunday weeks ending with the current week, with future days flagged', () => {
    const grid = activityGrid([sess('a', at(11, 20), 600), sess('b', at(11, 20, 18), 300)], NOW, 4);
    expect(grid).toHaveLength(28);
    expect(grid[0].date).toBe('2026-10-26');
    expect(grid[27].date).toBe('2026-11-22');
    const fri = grid.find((c) => c.date === '2026-11-20')!;
    expect(fri).toMatchObject({ count: 2, seconds: 900, future: false });
    expect(grid.find((c) => c.date === '2026-11-21')!.future).toBe(true);
    expect(grid.find((c) => c.date === '2026-11-19')).toMatchObject({ count: 0, future: false });
  });
});

describe('workoutStats', () => {
  it('gives count and last time per workout', () => {
    const list = [sess('a', at(11, 10), 600, 'w1'), sess('b', at(11, 18), 600, 'w1'), sess('c', at(11, 12), 600, 'w2')];
    const m = workoutStats(list);
    expect(m.get('w1')).toEqual({ count: 2, lastAt: at(11, 18) });
    expect(m.get('w2')).toEqual({ count: 1, lastAt: at(11, 12) });
    expect(m.get('nope')).toBeUndefined();
  });
});

describe('groupByDay', () => {
  it('groups newest day first, newest session first within a day', () => {
    const list = [sess('a', at(11, 18, 8)), sess('b', at(11, 20, 7)), sess('c', at(11, 20, 19))];
    const groups = groupByDay(list);
    expect(groups.map((g) => g.date)).toEqual(['2026-11-20', '2026-11-18']);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(['c', 'b']);
  });
});

describe('weights', () => {
  const w = (id: string, startedAt: number, weights: { exercise: string; value: number }[], unit: 'kg' | 'lb' = 'kg'): Session => ({
    ...sess(id, startedAt),
    weights,
    unit,
  });
  const list = [
    w('a', at(11, 2), [{ exercise: 'Goblet Squat', value: 12 }, { exercise: 'Flat Bench', value: 20 }]),
    w('b', at(11, 9), [{ exercise: 'goblet squat', value: 16 }]),
    w('c', at(11, 16), [{ exercise: 'Goblet Squat', value: 16 }, { exercise: 'Flat Bench', value: 20 }]),
    sess('no-weights', at(11, 18)),
  ];

  it('lastWeights gives the most recent weight per exercise, ignoring case', () => {
    const m = lastWeights(list);
    expect(m.get('goblet squat')).toMatchObject({ value: 16, unit: 'kg', at: at(11, 16) });
    expect(m.get('flat bench')).toMatchObject({ value: 20 });
    expect(m.get('chin ups')).toBeUndefined();
  });

  it('exerciseProgress shows the latest weight and the last different one, most recent exercise first', () => {
    const p = exerciseProgress(list);
    expect(p.map((x) => x.exercise)).toEqual(['Goblet Squat', 'Flat Bench']);
    expect(p[0].latest).toMatchObject({ value: 16, at: at(11, 16) });
    expect(p[0].previous).toMatchObject({ value: 12, at: at(11, 2) });
    expect(p[1].previous).toBeUndefined(); // 20 both times
  });

  it('does not compare weights across different units', () => {
    const mixed = [w('a', at(11, 2), [{ exercise: 'Row', value: 40 }], 'lb'), w('b', at(11, 9), [{ exercise: 'Row', value: 20 }], 'kg')];
    expect(exerciseProgress(mixed)[0].previous).toBeUndefined();
  });
});
