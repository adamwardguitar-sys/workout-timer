import { newId } from '../model/id';
import type { Step, Workout } from '../model/types';

const tap = (label: string, reps?: number): Step => ({
  id: newId(),
  label,
  kind: 'tap',
  role: 'work',
  ...(reps !== undefined ? { reps } : {}),
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

/** An exercise list: 40s on, 20s off through the list once. */
function exerciseList(name: string, labels: string[]): Workout {
  return {
    id: newId(),
    name,
    mode: 'interval',
    prepSeconds: 30,
    steps: labels.map((label) => ({ id: newId(), label, kind: 'timed', role: 'work', seconds: 40 })),
    rounds: 1,
    advance: 'step',
    restBetweenRounds: 0,
    restBetweenSteps: 20,
  };
}

export function seedWorkouts(): Workout[] {
  return [
    exerciseList('Full Body A', FULL_BODY_A),
    exerciseList('Full Body B', FULL_BODY_B),
    flow('Kettlebell Rounds (Athenian Complex)', [
      tap('Rows', 5),
      tap('Squats', 5),
      tap('Cleans', 5),
      tap('Swings', 5),
      tap('High Pulls', 5),
      tap('Snatches', 5),
      tap('Thrusters', 5),
      tap('Push Presses', 5),
      tap('Press Ups', 10),
    ]),
  ];
}
