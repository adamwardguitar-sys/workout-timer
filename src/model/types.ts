export type Mode = 'interval' | 'tabata' | 'emom' | 'amrap' | 'flow' | 'custom';

export interface Step {
  id: string;
  label: string;
  kind: 'timed' | 'tap';
  role: 'work' | 'rest';
  seconds?: number;
  reps?: number;
  counter?: boolean;
  /** Ask for the weight used for this exercise when the workout ends. Unticked means N/A. */
  weighted?: boolean;
}

export interface Workout {
  id: string;
  name: string;
  mode: Mode;
  prepSeconds: number;
  steps: Step[];
  rounds: number | null;
  advance: 'step' | 'round';
  restBetweenRounds: number;
  /** Shared rest after each exercise (timed steps, or tap steps when advance is 'step'). 0/absent = none. */
  restBetweenSteps?: number;
}

export interface SegmentItem {
  label: string;
  reps?: number;
}

export interface Segment {
  id: string;
  role: 'prep' | 'work' | 'rest';
  label: string;
  seconds: number | null;
  round: number;
  items?: SegmentItem[];
  itemIndex?: number;
  counter?: boolean;
}
