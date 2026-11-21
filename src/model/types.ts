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
  /** Untimed workouts only: 'step' = tap after each exercise. Default (absent or 'round') = one "Round done" tap per round. */
  advance?: 'step' | 'round';
  restBetweenRounds: number;
  /** Shared rest after each exercise (timed exercises). 0/absent = none. */
  restBetweenSteps?: number;
  /** Opt-in (off by default): stop at the start of each round after the first until you tap. */
  waitBetweenRounds?: boolean;
  /** Opt-in custom times per round, index = round - 1. Absent means every round is the same. */
  roundTimes?: RoundTime[];
}

export interface RoundTime {
  /** Replaces every timed exercise's time in this round. */
  work?: number;
  /** Replaces the shared rest after each exercise in this round. */
  rest?: number;
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
  counter?: boolean;
  /** Which exercise of the round this is, when each exercise is tapped separately. */
  itemIndex?: number;
  /** A tap-to-continue stop between rounds. */
  gate?: boolean;
}
