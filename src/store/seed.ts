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
    prepSeconds: 10,
    steps,
    rounds: null,
    advance: 'round',
    restBetweenRounds: 120,
  };
}

export function seedWorkouts(): Workout[] {
  return [
    flow(
      'Full Body A',
      [
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
      ].map((l) => tap(l)),
    ),
    flow(
      'Full Body B',
      [
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
      ].map((l) => tap(l)),
    ),
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
