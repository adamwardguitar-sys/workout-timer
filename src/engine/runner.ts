import { segmentsForRound, validateWorkout } from '../model/segments';
import type { Segment, Workout } from '../model/types';

/** Plain JSON so a run can be saved and resumed. */
export interface RunState {
  workout: Workout;
  segments: Segment[];
  index: number;
  /** Last round whose segments have been generated. */
  round: number;
  segmentStart: number;
  pausedAt: number | null;
  lastCountdown: number | null;
  laps: number;
  finished: boolean;
  beepSeconds: number;
}

export type RunEvent =
  | { type: 'segment-start'; segment: Segment }
  | { type: 'countdown'; secondsLeft: number }
  | { type: 'finish' };

export interface Stepped {
  state: RunState;
  events: RunEvent[];
}

/** Hard stop so a malformed segment list can never spin forever in one update. */
const MAX_ADVANCES = 10_000;

export function startRun(w: Workout, now: number, beepSeconds = 3): RunState {
  const errors = validateWorkout(w);
  if (errors.length > 0) throw new Error(errors.join(' '));
  const segments = [...segmentsForRound(w, 0), ...segmentsForRound(w, 1)];
  if (segments.length === 0) throw new Error('This workout has nothing to run.');
  return {
    workout: w,
    segments,
    index: 0,
    round: 1,
    segmentStart: now,
    pausedAt: null,
    lastCountdown: null,
    laps: 0,
    finished: false,
    beepSeconds,
  };
}

export function currentSegment(s: RunState): Segment {
  return s.segments[s.index];
}

export function remainingMs(s: RunState, now: number): number | null {
  const seg = currentSegment(s);
  if (seg.seconds === null) return null;
  return Math.max(0, s.segmentStart + seg.seconds * 1000 - (s.pausedAt ?? now));
}

function moveNext(st: RunState, t: number): RunState {
  let { segments, index, round } = st;
  index += 1;
  if (index >= segments.length) {
    const w = st.workout;
    if (w.rounds !== null && round >= w.rounds) return { ...st, finished: true };
    const next = segmentsForRound(w, round + 1);
    if (next.length === 0) return { ...st, finished: true };
    segments = [...segments.slice(-1), ...next]; // keep one segment behind for back()
    index = 1;
    round += 1;
  }
  return { ...st, segments, index, round, segmentStart: t, lastCountdown: null };
}

function stepEvents(st: RunState): RunEvent[] {
  return st.finished ? [{ type: 'finish' }] : [{ type: 'segment-start', segment: currentSegment(st) }];
}

export function update(s: RunState, now: number): Stepped {
  if (s.finished || s.pausedAt !== null) return { state: s, events: [] };

  let st = s;
  let advanced = false;
  let guard = 0;
  while (!st.finished) {
    const seg = currentSegment(st);
    if (seg.seconds === null) break;
    const end = st.segmentStart + seg.seconds * 1000;
    if (now < end) break;
    if (++guard > MAX_ADVANCES) {
      st = { ...st, finished: true };
      break;
    }
    st = moveNext(st, end);
    advanced = true;
  }

  const events: RunEvent[] = [];
  if (st.finished) {
    events.push({ type: 'finish' });
    return { state: st, events };
  }
  if (advanced) events.push({ type: 'segment-start', segment: currentSegment(st) });

  const seg = currentSegment(st);
  if (seg.seconds !== null) {
    const left = Math.ceil((st.segmentStart + seg.seconds * 1000 - now) / 1000);
    const fresh = st.lastCountdown === null || left < st.lastCountdown;
    if (left >= 1 && left <= st.beepSeconds && fresh) {
      events.push({ type: 'countdown', secondsLeft: left });
      st = { ...st, lastCountdown: left };
    }
  }
  return { state: st, events };
}

export function pause(s: RunState, now: number): RunState {
  if (s.finished || s.pausedAt !== null) return s;
  return { ...s, pausedAt: now };
}

export function resume(s: RunState, now: number): RunState {
  if (s.pausedAt === null) return s;
  return { ...s, segmentStart: s.segmentStart + (now - s.pausedAt), pausedAt: null };
}

export function done(s: RunState, now: number): Stepped {
  if (s.finished || s.pausedAt !== null) return { state: s, events: [] };
  const seg = currentSegment(s);
  if (seg.counter) return { state: { ...s, laps: s.laps + 1 }, events: [] };
  if (seg.seconds !== null) return { state: s, events: [] };
  const st = moveNext(s, now);
  return { state: st, events: stepEvents(st) };
}

export function skip(s: RunState, now: number): Stepped {
  if (s.finished) return { state: s, events: [] };
  const st = moveNext(s, s.pausedAt ?? now);
  return { state: st, events: stepEvents(st) };
}

export function back(s: RunState, now: number): RunState {
  if (s.finished) return s;
  const t = s.pausedAt ?? now;
  if (t - s.segmentStart >= 2000 || s.index === 0) {
    return { ...s, segmentStart: t, lastCountdown: null };
  }
  return { ...s, index: s.index - 1, segmentStart: t, lastCountdown: null };
}

export function adjustSeconds(s: RunState, deltaSeconds: number, now: number): RunState {
  const seg = currentSegment(s);
  if (s.finished || seg.seconds === null) return s;
  const elapsed = (s.pausedAt ?? now) - s.segmentStart;
  const seconds = Math.max(seg.seconds + deltaSeconds, elapsed / 1000 + 1);
  const segments = s.segments.map((x, i) => (i === s.index ? { ...x, seconds } : x));
  return { ...s, segments, lastCountdown: null };
}
