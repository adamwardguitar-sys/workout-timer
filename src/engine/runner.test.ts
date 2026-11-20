import {
  adjustSeconds,
  back,
  currentSegment,
  done,
  pause,
  remainingMs,
  resume,
  skip,
  startRun,
  update,
  type RunEvent,
} from './runner';
import type { Step, Workout } from '../model/types';

const timed = (label: string, seconds: number, role: Step['role'] = 'work', counter?: boolean): Step => ({
  id: label,
  label,
  kind: 'timed',
  role,
  seconds,
  ...(counter ? { counter } : {}),
});
const tap = (label: string): Step => ({ id: label, label, kind: 'tap', role: 'work' });
const wk = (over: Partial<Workout>): Workout => ({
  id: 'w',
  name: 'W',
  mode: 'custom',
  prepSeconds: 0,
  steps: [],
  rounds: 1,
  advance: 'step',
  restBetweenRounds: 0,
  ...over,
});

const T0 = 1_000_000;
const s = (n: number) => n * 1000;
const types = (events: RunEvent[]) => events.map((e) => e.type);

describe('startRun', () => {
  it('throws for a workout with a 0-second timed step', () => {
    expect(() => startRun(wk({ steps: [timed('Zero', 0)] }), T0)).toThrow();
  });

  it('throws for a workout with no steps', () => {
    expect(() => startRun(wk({ steps: [] }), T0)).toThrow();
  });

  it('starts on the prep segment when prep is set', () => {
    const r = startRun(wk({ prepSeconds: 10, steps: [timed('Work', 40)] }), T0);
    expect(currentSegment(r)).toMatchObject({ role: 'prep', seconds: 10 });
  });
});

describe('update', () => {
  it('moves from prep to work on the clock and emits segment-start', () => {
    const r = startRun(wk({ prepSeconds: 10, steps: [timed('Work', 40)] }), T0);
    const early = update(r, T0 + 9900);
    expect(early.state.index).toBe(0);
    expect(types(early.events)).not.toContain('segment-start');
    const later = update(early.state, T0 + s(10));
    expect(later.state.index).toBe(1);
    const start = later.events.find((e) => e.type === 'segment-start');
    expect(start).toMatchObject({ segment: { role: 'work', label: 'Work' } });
  });

  it('emits countdown 3, 2, 1 exactly once each, in order', () => {
    let st = startRun(wk({ prepSeconds: 10, steps: [timed('Work', 40)] }), T0);
    const seen: number[] = [];
    for (let t = 0; t < s(10); t += 250) {
      const out = update(st, T0 + t);
      st = out.state;
      for (const e of out.events) if (e.type === 'countdown') seen.push(e.secondsLeft);
    }
    expect(seen).toEqual([3, 2, 1]);
  });

  it('lands in the rest segment with the right time remaining', () => {
    const w = wk({ steps: [timed('Work', 40), timed('Rest', 20, 'rest'), timed('Work 2', 20)] });
    const out = update(startRun(w, T0), T0 + s(45));
    expect(currentSegment(out.state)).toMatchObject({ role: 'rest' });
    expect(remainingMs(out.state, T0 + s(45))).toBe(s(15));
  });

  it('catches up after a long gap: jumps to the right segment, one segment-start, no stale beeps', () => {
    const w = wk({ prepSeconds: 10, steps: [timed('Work', 40), timed('Rest', 20, 'rest')], rounds: 2 });
    const out = update(startRun(w, T0), T0 + s(75));
    // prep 0-10, work 10-50, rest 50-70, work 70-110
    expect(currentSegment(out.state)).toMatchObject({ role: 'work', round: 2 });
    expect(remainingMs(out.state, T0 + s(75))).toBe(s(35));
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({ type: 'segment-start', segment: { round: 2 } });
  });

  it('does not advance or emit anything while paused, and ignores time spent paused', () => {
    const r = startRun(wk({ steps: [timed('Work', 40)] }), T0);
    const paused = pause(r, T0 + s(5));
    const before = remainingMs(paused, T0 + s(5));
    const idle = update(paused, T0 + s(3605));
    expect(idle.events).toEqual([]);
    expect(idle.state).toBe(paused);
    expect(remainingMs(paused, T0 + s(3605))).toBe(before);
    const resumed = resume(paused, T0 + s(3605));
    expect(remainingMs(resumed, T0 + s(3605))).toBe(before);
    expect(remainingMs(resumed, T0 + s(3615))).toBe(before! - s(10));
  });

  it('ends a finite workout with a single finish event', () => {
    const r = startRun(wk({ steps: [timed('Work', 10)] }), T0);
    const end = update(r, T0 + s(10));
    expect(end.state.finished).toBe(true);
    expect(end.events).toEqual([{ type: 'finish' }]);
    expect(update(end.state, T0 + s(20)).events).toEqual([]);
  });

  it('terminates even when a zero-length segment is injected', () => {
    const r = startRun(wk({ steps: [timed('Work', 10)] }), T0);
    const zero = { ...r.segments[0], id: 'z', seconds: 0 };
    const out = update({ ...r, segments: [zero, ...r.segments] }, T0);
    expect(out.state.index).toBe(1);
  });

  it('keeps the segment list small over very many rounds', () => {
    const r = startRun(wk({ steps: [timed('Work', 10)], rounds: null }), T0);
    const out = update(r, T0 + s(10 * 500) + 1);
    expect(out.state.round).toBe(501);
    expect(out.state.segments.length).toBeLessThanOrEqual(4);
    expect(out.state.finished).toBe(false);
  });
});

describe('tap segments', () => {
  const flow = wk({
    steps: [tap('Rows'), tap('Squats')],
    advance: 'round',
    rounds: null,
    restBetweenRounds: 120,
  });

  it('never advance on the clock; done moves to the rest, which then runs into the next round', () => {
    let st = startRun(flow, T0);
    expect(update(st, T0 + s(9999)).state.index).toBe(0);
    const d = done(st, T0 + s(60));
    expect(currentSegment(d.state)).toMatchObject({ role: 'rest', seconds: 120 });
    expect(d.events[0]).toMatchObject({ type: 'segment-start', segment: { role: 'rest' } });
    const next = update(d.state, T0 + s(60) + s(120));
    expect(currentSegment(next.state)).toMatchObject({ role: 'work', round: 2, seconds: null });
    expect(next.events[0]).toMatchObject({ type: 'segment-start', segment: { round: 2 } });
  });
});

describe('amrap counter', () => {
  const amrap = wk({ steps: [timed('AMRAP', 600, 'work', true)], rounds: 1 });

  it('done increments laps without advancing, and the countdown ends the workout', () => {
    const r = startRun(amrap, T0);
    const d1 = done(r, T0 + s(100));
    expect(d1.state.laps).toBe(1);
    expect(d1.state.index).toBe(0);
    expect(d1.events).toEqual([]);
    const d2 = done(d1.state, T0 + s(200));
    expect(d2.state.laps).toBe(2);
    const end = update(d2.state, T0 + s(600));
    expect(end.state.finished).toBe(true);
    expect(end.events).toEqual([{ type: 'finish' }]);
  });
});

describe('skip, back and adjustSeconds', () => {
  const w = wk({ steps: [timed('A', 40), timed('B', 30)] });

  it('skip jumps to the next segment', () => {
    const out = skip(startRun(w, T0), T0 + s(5));
    expect(currentSegment(out.state).label).toBe('B');
    expect(remainingMs(out.state, T0 + s(5))).toBe(s(30));
  });

  it('skip on the last segment finishes the workout', () => {
    const second = skip(startRun(w, T0), T0 + s(5)).state;
    const out = skip(second, T0 + s(6));
    expect(out.state.finished).toBe(true);
    expect(out.events).toEqual([{ type: 'finish' }]);
  });

  it('back restarts the current segment when more than 2s in', () => {
    const second = skip(startRun(w, T0), T0 + s(5)).state;
    const b = back(second, T0 + s(10));
    expect(currentSegment(b).label).toBe('B');
    expect(remainingMs(b, T0 + s(10))).toBe(s(30));
  });

  it('back goes to the previous segment when less than 2s in', () => {
    const second = skip(startRun(w, T0), T0 + s(5)).state;
    const b = back(second, T0 + s(6));
    expect(currentSegment(b).label).toBe('A');
    expect(remainingMs(b, T0 + s(6))).toBe(s(40));
  });

  it('adjustSeconds extends the current timed segment', () => {
    const r = adjustSeconds(startRun(w, T0), 15, T0 + s(10));
    expect(remainingMs(r, T0 + s(10))).toBe(s(45));
  });

  it('adjustSeconds clamps to leave 1 second remaining', () => {
    const r = adjustSeconds(startRun(w, T0), -1000, T0 + s(10));
    expect(remainingMs(r, T0 + s(10))).toBe(1000);
  });
});
