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

import { dateLabel, formatDuration, relativeDay, shortDate } from './format';

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [45, '45s'],
    [60, '1 min'],
    [600, '10 min'],
    [3540, '59 min'],
    [3600, '1 h 00 min'],
    [3900, '1 h 05 min'],
  ])('%i seconds -> %s', (sec, out) => expect(formatDuration(sec)).toBe(out));
});

describe('relativeDay', () => {
  const at = (m: number, d: number, h = 9) => new Date(2026, m - 1, d, h, 0).getTime();
  const NOW = at(11, 20, 12);
  it.each([
    [at(11, 20, 7), 'Today'],
    [at(11, 19, 23), 'Yesterday'],
    [at(11, 17), '3 days ago'],
    [at(11, 13), '1 week ago'],
    [at(11, 2), '2 weeks ago'],
    [at(9, 1), '2 months ago'],
  ])('%#', (ts, out) => expect(relativeDay(ts, NOW)).toBe(out));
});

describe('dateLabel', () => {
  it('formats a YYYY-MM-DD key as weekday, day and month', () => {
    expect(dateLabel('2026-11-20')).toBe('Fri 20 Nov');
    expect(dateLabel('2026-01-05')).toBe('Mon 5 Jan');
  });
});

describe('shortDate', () => {
  it('formats a timestamp as day and month', () => {
    expect(shortDate(new Date(2026, 10, 2, 9).getTime())).toBe('2 Nov');
    expect(shortDate(new Date(2026, 0, 15, 23).getTime())).toBe('15 Jan');
  });
});
