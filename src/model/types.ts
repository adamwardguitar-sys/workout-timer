export type Mode = 'interval' | 'tabata' | 'emom' | 'amrap' | 'flow' | 'custom';

export interface Step {
  id: string;
  label: string;
  kind: 'timed' | 'tap';
  role: 'work' | 'rest';
  seconds?: number;
  reps?: number;
  counter?: boolean;
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
  /** Opt-in: stop at the start of each round after the first until you tap. Off by default. */
  waitBetweenRounds?: boolean;
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
  /** A tap-to-continue stop between rounds. */
  gate?: boolean;
}
