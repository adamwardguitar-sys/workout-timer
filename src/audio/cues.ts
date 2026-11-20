import type { RunEvent } from '../engine/runner';

export type Cue = 'beep' | 'work' | 'rest' | 'finish';

export function cueFor(e: RunEvent): Cue | null {
  switch (e.type) {
    case 'countdown':
      return 'beep';
    case 'finish':
      return 'finish';
    case 'segment-start':
      if (e.segment.role === 'work') return 'work';
      if (e.segment.role === 'rest') return 'rest';
      return null;
  }
}
