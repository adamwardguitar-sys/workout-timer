import { newId } from '../model/id';
import type { Step, Workout } from '../model/types';

const tap = (label: string, reps?: number, weighted?: boolean): Step => ({
  id: newId(),
  label,
  kind: 'tap',
  role: 'work',
  ...(reps !== undefined ? { reps } : {}),
  ...(weighted ? { weighted: true } : {}),
});

function flow(name: string, steps: Step[]): Workout {
  return {
    id: newId(),
    name,
    mode: 'flow',
    prepSeconds: 30,
    steps,
    rounds: null,
    advance: 'round',
    restBetweenRounds: 120,
  };
}

export const FULL_BODY_A = [
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
];

export const FULL_BODY_B = [
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
];

/** Which exercises use a weight, so "Track weight" starts ticked for them. */
export const WEIGHTED_A = ['Flat Bench', 'B Stance RDL', 'KB Shoulder Press', 'Goblet Squat', 'Bicep Curls'];
export const WEIGHTED_B = [
  'Offset Squats',
  '1 Arm Rows',
  'Thrusters',
  'Single RDL',
  'KB Shoulder Press',
  'High Pulls',
  'Horn Curls',
  'Weighted Crunches',
];
export const ATHENIAN_LABELS = [
  'Rows',
  'Squats',
  'Cleans',
  'Swings',
  'High Pulls',
  'Snatches',
  'Thrusters',
  'Push Presses',
  'Press Ups',
];
export const WEIGHTED_ATHENIAN = ATHENIAN_LABELS.slice(0, 8);

/** An exercise list: 40s on, 20s off through the list once. */
function exerciseList(name: string, labels: string[], weighted: string[]): Workout {
  return {
    id: newId(),
    name,
    mode: 'interval',
    prepSeconds: 30,
    steps: labels.map((label) => ({
      id: newId(),
      label,
      kind: 'timed',
      role: 'work',
      seconds: 40,
      ...(weighted.includes(label) ? { weighted: true } : {}),
    })),
    rounds: 1,
    advance: 'step',
    restBetweenRounds: 0,
    restBetweenSteps: 20,
  };
}

export function seedWorkouts(): Workout[] {
  return [
    exerciseList('Full Body A', FULL_BODY_A, WEIGHTED_A),
    exerciseList('Full Body B', FULL_BODY_B, WEIGHTED_B),
    flow(
      'Kettlebell Rounds (Athenian Complex)',
      ATHENIAN_LABELS.map((label, i) => tap(label, i === 8 ? 10 : 5, WEIGHTED_ATHENIAN.includes(label))),
    ),
  ];
}
