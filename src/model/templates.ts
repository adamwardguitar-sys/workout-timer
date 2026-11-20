import { newId } from './id';
import type { Mode, Step, Workout } from './types';

const timed = (label: string, seconds: number, role: Step['role'] = 'work', counter?: boolean): Step => ({
  id: newId(),
  label,
  kind: 'timed',
  role,
  seconds,
  ...(counter ? { counter } : {}),
});

const tap = (label: string): Step => ({ id: newId(), label, kind: 'tap', role: 'work' });

const NAMES: Record<Mode, string> = {
  interval: 'New Interval workout',
  tabata: 'New Tabata',
  emom: 'New EMOM',
  amrap: 'New AMRAP',
  flow: 'New Kettlebell Flow',
  custom: 'New Custom workout',
};

export function templateFor(mode: Mode): Workout {
  const base = {
    id: newId(),
    name: NAMES[mode],
    mode,
    prepSeconds: 10,
    advance: 'step' as const,
    restBetweenRounds: 0,
  };
  switch (mode) {
    case 'interval':
      return {
        ...base,
        steps: [timed('Exercise 1', 40), timed('Exercise 2', 40), timed('Exercise 3', 40)],
        restBetweenSteps: 20,
        rounds: 3,
      };
    case 'tabata':
      return { ...base, steps: [timed('Work', 20), timed('Rest', 10, 'rest')], rounds: 8 };
    case 'emom':
      return { ...base, steps: [timed('Every minute', 60)], rounds: 10 };
    case 'amrap':
      return { ...base, steps: [timed('AMRAP', 600, 'work', true)], rounds: 1 };
    case 'flow':
      return {
        ...base,
        steps: [tap('Exercise 1'), tap('Exercise 2'), tap('Exercise 3')],
        rounds: null,
        advance: 'round',
        restBetweenRounds: 120,
      };
    case 'custom':
      return { ...base, steps: [timed('Work', 30), timed('Rest', 15, 'rest')], rounds: 3 };
  }
}
