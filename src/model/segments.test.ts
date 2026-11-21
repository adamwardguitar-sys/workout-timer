import { estimateSeconds, segmentsForRound, validateWorkout } from './segments';
import { templateFor } from './templates';
import type { Step, Workout } from './types';

const timed = (label: string, seconds: number, role: Step['role'] = 'work'): Step => ({
  id: label,
  label,
  kind: 'timed',
  role,
  seconds,
});
const tap = (label: string, reps?: number): Step => ({ id: label, label, kind: 'tap', role: 'work', reps });
const wk = (over: Partial<Workout>): Workout => ({
  id: 'w',
  name: 'W',
  mode: 'custom',
  prepSeconds: 0,
  steps: [],
  rounds: 1,
  restBetweenRounds: 0,
  ...over,
});

describe('segmentsForRound', () => {
  const interval = wk({ steps: [timed('Work', 40), timed('Rest', 20, 'rest')], rounds: 3 });

  it('keeps the trailing rest step on early rounds', () => {
    const segs = segmentsForRound(interval, 1);
    expect(segs.map((s) => [s.role, s.seconds])).toEqual([
      ['work', 40],
      ['rest', 20],
    ]);
  });

  it('omits the trailing rest step on the final round', () => {
    const segs = segmentsForRound(interval, 3);
    expect(segs.map((s) => [s.role, s.seconds])).toEqual([['work', 40]]);
  });

  it('flow with advance=round merges tap steps into one segment then rests', () => {
    const w = wk({
      steps: [tap('Rows', 5), tap('Squats', 5), tap('Cleans', 5)],
      advance: 'round',
      rounds: null,
      restBetweenRounds: 120,
    });
    const segs = segmentsForRound(w, 1);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ role: 'work', seconds: null, round: 1 });
    expect(segs[0].items).toEqual([
      { label: 'Rows', reps: 5 },
      { label: 'Squats', reps: 5 },
      { label: 'Cleans', reps: 5 },
    ]);
    expect(segs[1]).toMatchObject({ role: 'rest', seconds: 120 });
  });

  it('with rounds null the round rest is always present', () => {
    const w = wk({ steps: [tap('A')], advance: 'round', rounds: null, restBetweenRounds: 120 });
    expect(segmentsForRound(w, 50).at(-1)).toMatchObject({ role: 'rest', seconds: 120 });
  });

  it('final round of a finite flow has no round rest', () => {
    const w = wk({ steps: [tap('A')], advance: 'round', rounds: 2, restBetweenRounds: 120 });
    expect(segmentsForRound(w, 1)).toHaveLength(2);
    expect(segmentsForRound(w, 2)).toHaveLength(1);
  });

  it('merged tap segment sits at the position of the first tap step', () => {
    const w = wk({
      steps: [tap('A'), timed('Hold', 30), tap('B')],
      advance: 'round',
      rounds: 5,
    });
    const segs = segmentsForRound(w, 1);
    expect(segs.map((s) => [s.role, s.seconds])).toEqual([
      ['work', null],
      ['work', 30],
    ]);
    expect(segs[0].items?.map((i) => i.label)).toEqual(['A', 'B']);
  });

  it('round 0 is the prep segment, or nothing when prep is 0', () => {
    expect(segmentsForRound(wk({ prepSeconds: 10, steps: [tap('A')] }), 0)).toMatchObject([
      { role: 'prep', seconds: 10, round: 0 },
    ]);
    expect(segmentsForRound(wk({ prepSeconds: 0, steps: [tap('A')] }), 0)).toEqual([]);
  });

  it('amrap step produces a counter segment', () => {
    const segs = segmentsForRound(templateFor('amrap'), 1);
    expect(segs[0]).toMatchObject({ role: 'work', counter: true });
    expect(segs[0].seconds).toBeGreaterThan(0);
  });
});

describe('validateWorkout', () => {
  it('accepts every template', () => {
    for (const m of ['interval', 'tabata', 'emom', 'amrap', 'flow', 'custom'] as const) {
      expect(validateWorkout(templateFor(m))).toEqual([]);
    }
  });

  it('rejects a workout with no steps', () => {
    expect(validateWorkout(wk({ steps: [] })).length).toBeGreaterThan(0);
  });

  it('rejects a timed step with 0 seconds', () => {
    expect(validateWorkout(wk({ steps: [timed('Zero', 0)] })).length).toBeGreaterThan(0);
  });

  it('rejects negative prep seconds', () => {
    expect(validateWorkout(wk({ steps: [tap('A')], prepSeconds: -1 })).length).toBeGreaterThan(0);
  });

  it('rejects rounds of 0', () => {
    expect(validateWorkout(wk({ steps: [tap('A')], rounds: 0 })).length).toBeGreaterThan(0);
  });

  it('rejects negative rest between rounds', () => {
    expect(validateWorkout(wk({ steps: [tap('A')], restBetweenRounds: -5 })).length).toBeGreaterThan(0);
  });
});

describe('restBetweenSteps (exercise list with a shared rest)', () => {
  const list = (over: Partial<Workout> = {}) =>
    wk({ steps: [timed('A', 40), timed('B', 40), timed('C', 40)], restBetweenSteps: 20, rounds: 1, ...over });
  const shape = (segs: ReturnType<typeof segmentsForRound>) => segs.map((x) => [x.label, x.role, x.seconds]);

  it('adds a rest after each exercise except the last of the final round', () => {
    expect(shape(segmentsForRound(list(), 1))).toEqual([
      ['A', 'work', 40],
      ['Rest', 'rest', 20],
      ['B', 'work', 40],
      ['Rest', 'rest', 20],
      ['C', 'work', 40],
    ]);
  });

  it('rests after the last exercise too when another round follows', () => {
    const w = list({ rounds: 2 });
    expect(segmentsForRound(w, 1).at(-1)).toMatchObject({ role: 'rest', seconds: 20 });
    expect(segmentsForRound(w, 2).at(-1)).toMatchObject({ label: 'C', role: 'work' });
  });

  it('a rest between rounds replaces the last exercise rest rather than adding to it', () => {
    const segs = segmentsForRound(list({ rounds: 2, restBetweenRounds: 60 }), 1);
    expect(segs.slice(-2).map((x) => [x.role, x.seconds])).toEqual([
      ['work', 40],
      ['rest', 60],
    ]);
  });

  it('runs a Rest segment after every exercise forever when rounds is null', () => {
    expect(segmentsForRound(list({ rounds: null }), 9).at(-1)).toMatchObject({ role: 'rest', seconds: 20 });
  });

  it('adds nothing when it is 0 or missing', () => {
    expect(segmentsForRound(list({ restBetweenSteps: 0 }), 1)).toHaveLength(3);
    expect(segmentsForRound(list({ restBetweenSteps: undefined }), 1)).toHaveLength(3);
  });

  it('does not double up when the next step is already a rest step', () => {
    const w = wk({ steps: [timed('A', 40), timed('Break', 15, 'rest'), timed('B', 40)], restBetweenSteps: 20, rounds: 1 });
    expect(shape(segmentsForRound(w, 1))).toEqual([
      ['A', 'work', 40],
      ['Break', 'rest', 15],
      ['B', 'work', 40],
    ]);
  });

  it('is rejected by validateWorkout when negative', () => {
    expect(validateWorkout(list({ restBetweenSteps: -5 })).length).toBeGreaterThan(0);
  });
});

describe('estimateSeconds', () => {
  it('adds up get-ready, work and rests across all rounds for a fixed-length workout', () => {
    // 30 get-ready + 3 exercises x 40 + 2 rests x 20 = 190 (the last rest is dropped)
    expect(
      estimateSeconds(wk({ prepSeconds: 30, steps: [timed('A', 40), timed('B', 40), timed('C', 40)], restBetweenSteps: 20, rounds: 1 })),
    ).toBe(190);
  });

  it('counts every round', () => {
    // prep 0, (40 + 20 rest) x 3 rounds minus the final trailing rest = 160
    expect(estimateSeconds(wk({ steps: [timed('Work', 40), timed('Rest', 20, 'rest')], rounds: 3 }))).toBe(160);
  });

  it('is unknown (null) when it depends on you: tap steps or until-I-stop', () => {
    expect(estimateSeconds(wk({ steps: [tap('A')], rounds: 1 }))).toBeNull();
    expect(estimateSeconds(wk({ steps: [timed('A', 40)], rounds: null }))).toBeNull();
  });

  it('matches the Tabata template (20/10 x 8) and the AMRAP template', () => {
    expect(estimateSeconds({ ...templateFor('tabata'), prepSeconds: 0 })).toBe(8 * 20 + 7 * 10);
    expect(estimateSeconds({ ...templateFor('amrap'), prepSeconds: 0 })).toBe(600);
  });
});

describe('custom times per round (roundTimes)', () => {
  const base = (over: Partial<Workout> = {}) =>
    wk({ steps: [timed('A', 40), timed('B', 40)], restBetweenSteps: 20, rounds: 3, ...over });
  const shape = (segs: ReturnType<typeof segmentsForRound>) => segs.map((x) => [x.label, x.seconds]);

  it('uses each round its own work and rest time', () => {
    const w = base({ roundTimes: [{ work: 40, rest: 20 }, { work: 45, rest: 15 }, { work: 50, rest: 10 }] });
    expect(shape(segmentsForRound(w, 1))).toEqual([['A', 40], ['Rest', 20], ['B', 40], ['Rest', 20]]);
    expect(shape(segmentsForRound(w, 2))).toEqual([['A', 45], ['Rest', 15], ['B', 45], ['Rest', 15]]);
    expect(shape(segmentsForRound(w, 3))).toEqual([['A', 50], ['Rest', 10], ['B', 50]]); // final round: no trailing rest
  });

  it('a work time replaces every exercise time in that round, even when exercises differ', () => {
    const w = base({ steps: [timed('Plank', 30), timed('Squats', 50)], roundTimes: [{ work: 45 }] });
    expect(segmentsForRound(w, 1).filter((x) => x.role === 'work').map((x) => x.seconds)).toEqual([45, 45]);
    // a round with no entry keeps each exercise's own time
    expect(segmentsForRound(w, 2).filter((x) => x.role === 'work').map((x) => x.seconds)).toEqual([30, 50]);
  });

  it('each field falls back on its own: no rest entry keeps the shared rest', () => {
    const w = base({ roundTimes: [{ work: 45 }] });
    expect(shape(segmentsForRound(w, 1))).toEqual([['A', 45], ['Rest', 20], ['B', 45], ['Rest', 20]]);
    const w2 = base({ roundTimes: [{ rest: 5 }] });
    expect(shape(segmentsForRound(w2, 1))).toEqual([['A', 40], ['Rest', 5], ['B', 40], ['Rest', 5]]);
  });

  it('a rest of 0 in a round removes the rests for that round', () => {
    const w = base({ roundTimes: [{ rest: 0 }] });
    expect(shape(segmentsForRound(w, 1))).toEqual([['A', 40], ['B', 40]]);
  });

  it('does not touch explicit rest steps or counter steps', () => {
    const w = wk({
      steps: [timed('A', 40), timed('Break', 15, 'rest'), { ...timed('Count', 60), counter: true }],
      rounds: 1,
      roundTimes: [{ work: 45 }],
    });
    expect(shape(segmentsForRound(w, 1))).toEqual([['A', 45], ['Break', 15], ['Count', 60]]);
  });

  it('is counted in the estimated length', () => {
    const w = base({
      prepSeconds: 0,
      rounds: 2,
      roundTimes: [{ work: 40, rest: 20 }, { work: 60, rest: 10 }],
    });
    // round 1: 40+20+40+20 = 120 ; round 2: 60+10+60 = 130 (final round drops the last rest)
    expect(estimateSeconds(w)).toBe(250);
  });

  it('rejects a work time of 0 and a negative rest', () => {
    expect(validateWorkout(base({ roundTimes: [{ work: 0 }] })).length).toBeGreaterThan(0);
    expect(validateWorkout(base({ roundTimes: [{ rest: -1 }] })).length).toBeGreaterThan(0);
    expect(validateWorkout(base({ roundTimes: [{ work: 40, rest: 0 }, {}] }))).toEqual([]);
  });
});

describe('waitBetweenRounds (opt-in pause between rounds, off by default)', () => {
  const w = (over: Partial<Workout> = {}) =>
    wk({ steps: [timed('A', 40), timed('B', 40)], rounds: 3, waitBetweenRounds: true, ...over });

  it('puts a tap-to-continue gate at the start of every round after the first', () => {
    expect(segmentsForRound(w(), 1).some((x) => x.gate)).toBe(false);
    const r2 = segmentsForRound(w(), 2);
    expect(r2[0]).toMatchObject({ role: 'rest', label: 'Round 2', seconds: null, gate: true, round: 2 });
    expect(r2).toHaveLength(3);
    expect(segmentsForRound(w(), 3)[0]).toMatchObject({ label: 'Round 3', gate: true });
  });

  it('also applies when rounds is until-I-stop', () => {
    expect(segmentsForRound(w({ rounds: null }), 7)[0]).toMatchObject({ label: 'Round 7', gate: true });
  });

  it('is off by default and when false', () => {
    expect(segmentsForRound(w({ waitBetweenRounds: undefined }), 2).some((x) => x.gate)).toBe(false);
    expect(segmentsForRound(w({ waitBetweenRounds: false }), 2).some((x) => x.gate)).toBe(false);
  });
});

describe('advance = step (opt-in tap per exercise for untimed workouts)', () => {
  const taps = [tap('A'), tap('B'), tap('C')];

  it('makes one tap segment per exercise with its index, and a rest after each when a shared rest is set', () => {
    const segs = segmentsForRound(wk({ steps: taps, advance: 'step', restBetweenSteps: 20, rounds: 2 }), 1);
    expect(segs.filter((x) => x.role === 'work').map((x) => x.itemIndex)).toEqual([0, 1, 2]);
    expect(segs.every((x) => x.role === 'rest' || x.items?.length === 3)).toBe(true);
    expect(segs.map((x) => x.role)).toEqual(['work', 'rest', 'work', 'rest', 'work', 'rest']);
  });

  it('is the default only when asked: undefined or round gives one Round block', () => {
    for (const advance of [undefined, 'round' as const]) {
      const segs = segmentsForRound(wk({ steps: taps, advance, rounds: 1 }), 1);
      expect(segs).toHaveLength(1);
      expect(segs[0]).not.toHaveProperty('itemIndex');
    }
  });
});
