import { MODE_LABELS, formatTime } from './format';

describe('formatTime', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65, '1:05'],
    [120, '2:00'],
    [600, '10:00'],
    [3725, '1:02:05'],
  ])('%i seconds -> %s', (s, out) => expect(formatTime(s)).toBe(out));

  it('never shows negative time', () => {
    expect(formatTime(-3)).toBe('0:00');
  });
});

describe('MODE_LABELS', () => {
  it('names every mode', () => {
    expect(MODE_LABELS.flow).toBe('Kettlebell Flow');
    expect(Object.keys(MODE_LABELS).sort()).toEqual(['amrap', 'custom', 'emom', 'flow', 'interval', 'tabata']);
  });
});
