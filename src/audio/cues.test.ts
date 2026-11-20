import { cueFor } from './cues';
import type { Segment } from '../model/types';

const seg = (role: Segment['role']): Segment => ({ id: 'x', role, label: 'x', seconds: 10, round: 1 });

describe('cueFor', () => {
  it('maps countdown to beep', () => {
    expect(cueFor({ type: 'countdown', secondsLeft: 3 })).toBe('beep');
  });
  it('maps work start to work', () => {
    expect(cueFor({ type: 'segment-start', segment: seg('work') })).toBe('work');
  });
  it('maps rest start to rest', () => {
    expect(cueFor({ type: 'segment-start', segment: seg('rest') })).toBe('rest');
  });
  it('plays nothing at the start of prep', () => {
    expect(cueFor({ type: 'segment-start', segment: seg('prep') })).toBeNull();
  });
  it('maps finish to finish', () => {
    expect(cueFor({ type: 'finish' })).toBe('finish');
  });
});
