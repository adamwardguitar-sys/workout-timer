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
  /** When the run began, and total time spent paused: together they give the active time. */
  startedAt: number;
  pausedMs: number;
  /** Exact moment the run ended (set when finished). */
  endedAt?: number;
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

/** A run of zero-length segments this long means the segment list is malformed; stop rather than spin. */
const MAX_STALLED = 1_000;

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
    startedAt: now,
    pausedMs: 0,
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
    if (w.rounds !== null && round >= w.rounds) return { ...st, finished: true, endedAt: t };
    const next = segmentsForRound(w, round + 1);
    if (next.length === 0) return { ...st, finished: true, endedAt: t };
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
  let stalled = 0; // consecutive advances that took no time
  while (!st.finished) {
    const seg = currentSegment(st);
    if (seg.seconds === null) break;
    const end = st.segmentStart + seg.seconds * 1000;
    if (now < end) break;
    if (end <= st.segmentStart) {
      if (++stalled > MAX_STALLED) {
        st = { ...st, finished: true, endedAt: now };
        break;
      }
    } else {
      stalled = 0;
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
    // no beep for the very first second of a segment: it would sit on top of the start tone
    if (left >= 1 && left <= st.beepSeconds && left < seg.seconds && fresh) {
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
  const gap = now - s.pausedAt;
  return { ...s, segmentStart: s.segmentStart + gap, pausedMs: s.pausedMs + gap, pausedAt: null };
}

export function done(s: RunState, now: number): Stepped {
  if (s.finished || s.pausedAt !== null) return { state: s, events: [] };
  const seg = currentSegment(s);
  if (seg.counter) return { state: { ...s, laps: s.laps + 1 }, events: [] };
  if (seg.seconds !== null) return { state: s, events: [] };
  const st = moveNext(s, now);
  return { state: st, events: stepEvents(st) };
}

/** Move on to whatever comes next (get ready, then exercise, then rest, ...), or finish if nothing does. */
export function skip(s: RunState, now: number): Stepped {
  if (s.finished) return { state: s, events: [] };
  const st = moveNext(s, s.pausedAt ?? now);
  return { state: st, events: stepEvents(st) };
}

export function undoLap(s: RunState): RunState {
  return { ...s, laps: Math.max(0, s.laps - 1) };
}

export function adjustSeconds(s: RunState, deltaSeconds: number, now: number): RunState {
  const seg = currentSegment(s);
  if (s.finished || seg.seconds === null) return s;
  const elapsed = (s.pausedAt ?? now) - s.segmentStart;
  const seconds = Math.max(seg.seconds + deltaSeconds, elapsed / 1000 + 1);
  const segments = s.segments.map((x, i) => (i === s.index ? { ...x, seconds } : x));
  return { ...s, segments, lastCountdown: null };
}

export interface RunSummary {
  /** Active seconds: paused time is not counted. */
  durationSec: number;
  /** Whole rounds finished (a round counts once you reach the rest that closes it). */
  roundsDone: number;
  laps: number;
  /** True only if the workout ran to its end. */
  completed: boolean;
}

export function summarize(s: RunState, now: number): RunSummary {
  const end = s.endedAt ?? s.pausedAt ?? now;
  const durationSec = Math.max(0, Math.round((end - s.startedAt - s.pausedMs) / 1000));
  let roundsDone: number;
  if (s.finished) {
    roundsDone = s.workout.rounds ?? s.round;
  } else {
    const seg = currentSegment(s);
    const next = s.segments[s.index + 1];
    const closesRound = seg.role === 'rest' && (!next || next.round !== seg.round);
    roundsDone = seg.round === 0 ? 0 : seg.round - 1 + (closesRound ? 1 : 0);
  }
  return { durationSec, roundsDone, laps: s.laps, completed: s.finished };
}
