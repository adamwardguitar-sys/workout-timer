import type { Segment, SegmentItem, Workout } from './types';

/** Segments for one round. Round 0 is the get-ready segment (empty when prep is 0). */
export function segmentsForRound(w: Workout, round: number): Segment[] {
  if (round === 0) {
    return w.prepSeconds > 0
      ? [{ id: '0:0', role: 'prep', label: 'Get ready', seconds: w.prepSeconds, round: 0 }]
      : [];
  }

  const isFinal = w.rounds !== null && round >= w.rounds;
  const isTapWork = (s: Workout['steps'][number]) => s.kind === 'tap' && s.role === 'work';
  const items: SegmentItem[] = w.steps.filter(isTapWork).map((s) => ({ label: s.label, reps: s.reps }));
  const segs: Segment[] = [];
  const push = (seg: Omit<Segment, 'id' | 'round'>) =>
    segs.push({ ...seg, id: `${round}:${segs.length}`, round });

  const stepRest = w.restBetweenSteps ?? 0;
  const paced = (s: Workout['steps'][number]) => s.role === 'work' && (s.kind === 'timed' || w.advance === 'step');
  let mergedEmitted = false;
  let tapIndex = 0;
  for (let i = 0; i < w.steps.length; i++) {
    const s = w.steps[i];
    if (isTapWork(s)) {
      if (w.advance === 'round') {
        if (mergedEmitted) continue;
        mergedEmitted = true;
        push({ role: 'work', label: 'Exercises', seconds: null, items });
      } else {
        push({ role: 'work', label: s.label, seconds: null, items, itemIndex: tapIndex++ });
      }
    } else if (s.kind === 'tap') {
      push({ role: s.role, label: s.label, seconds: null });
    } else {
      push({ role: s.role, label: s.label, seconds: s.seconds ?? 0, ...(s.counter ? { counter: true } : {}) });
    }

    // shared rest after each exercise; the round rest takes over after the last one
    if (stepRest > 0 && paced(s) && w.steps[i + 1]?.role !== 'rest') {
      const isLast = i === w.steps.length - 1;
      if (!(isLast && (isFinal || w.restBetweenRounds > 0))) push({ role: 'rest', label: 'Rest', seconds: stepRest });
    }
  }

  if (isFinal) {
    while (segs.length > 0 && segs[segs.length - 1].role === 'rest') segs.pop();
  } else if (w.restBetweenRounds > 0) {
    push({ role: 'rest', label: 'Rest', seconds: w.restBetweenRounds });
  }
  return segs;
}

/** Returns human-readable problems; an empty array means the workout can run. */
export function validateWorkout(w: Workout): string[] {
  const errors: string[] = [];
  if (w.steps.length === 0) errors.push('Add at least one step.');
  for (const s of w.steps) {
    if (s.kind === 'timed' && !(Number.isFinite(s.seconds) && (s.seconds ?? 0) > 0)) {
      errors.push(`"${s.label || 'Untitled step'}" needs a time above 0.`);
    }
  }
  if (!Number.isFinite(w.prepSeconds) || w.prepSeconds < 0) errors.push('Get ready time cannot be negative.');
  if (w.rounds !== null && (!Number.isInteger(w.rounds) || w.rounds < 1)) {
    errors.push('Rounds must be 1 or more, or "until I stop".');
  }
  if (!Number.isFinite(w.restBetweenRounds) || w.restBetweenRounds < 0) {
    errors.push('Rest between rounds cannot be negative.');
  }
  if (w.restBetweenSteps !== undefined && (!Number.isFinite(w.restBetweenSteps) || w.restBetweenSteps < 0)) {
    errors.push('Rest after each exercise cannot be negative.');
  }
  return errors;
}

/**
 * Total seconds for a workout that runs a known length: get-ready, every round, every rest.
 * Null when it depends on you (tap steps, or "until I stop").
 */
export function estimateSeconds(w: Workout): number | null {
  if (w.rounds === null) return null;
  let total = 0;
  for (let round = 0; round <= w.rounds; round++) {
    for (const seg of segmentsForRound(w, round)) {
      if (seg.seconds === null) return null;
      total += seg.seconds;
    }
  }
  return total;
}
