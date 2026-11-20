import { templateFor } from './templates';

describe('templateFor', () => {
  it('tabata is 20s work, 10s rest, 8 rounds, no round rest', () => {
    const w = templateFor('tabata');
    expect(w.mode).toBe('tabata');
    expect(w.steps).toHaveLength(2);
    expect(w.steps[0]).toMatchObject({ role: 'work', kind: 'timed', seconds: 20 });
    expect(w.steps[1]).toMatchObject({ role: 'rest', kind: 'timed', seconds: 10 });
    expect(w.rounds).toBe(8);
    expect(w.restBetweenRounds).toBe(0);
  });

  it('emom is one timed 60s step for 10 rounds', () => {
    const w = templateFor('emom');
    expect(w.steps).toHaveLength(1);
    expect(w.steps[0]).toMatchObject({ role: 'work', kind: 'timed', seconds: 60 });
    expect(w.rounds).toBe(10);
  });

  it('amrap is one timed counter step for a single round', () => {
    const w = templateFor('amrap');
    expect(w.steps).toHaveLength(1);
    expect(w.steps[0]).toMatchObject({ role: 'work', kind: 'timed', counter: true });
    expect(w.rounds).toBe(1);
  });

  it('flow taps once per round, forever, with 2:00 rest and tap steps only', () => {
    const w = templateFor('flow');
    expect(w.rounds).toBeNull();
    expect(w.restBetweenRounds).toBe(120);
    expect(w.steps.length).toBeGreaterThan(0);
    expect(w.steps.every((s) => s.kind === 'tap')).toBe(true);
  });

  it('interval and custom templates are valid starting points', () => {
    expect(templateFor('interval').steps.length).toBeGreaterThan(0);
    expect(templateFor('custom').steps.length).toBeGreaterThan(0);
  });

  it('gives fresh ids on every call', () => {
    const a = templateFor('flow');
    const b = templateFor('flow');
    expect(a.id).not.toBe(b.id);
    expect(a.steps[0].id).not.toBe(b.steps[0].id);
  });

  it('interval is a list of 40s exercises with a shared 20s rest', () => {
    const w = templateFor('interval');
    expect(w.steps).toHaveLength(3);
    expect(w.steps.every((x) => x.kind === 'timed' && x.role === 'work' && x.seconds === 40)).toBe(true);
    expect(w.restBetweenSteps).toBe(20);
    expect(w.rounds).toBe(3);
  });

  it('every template starts with a 30 second get-ready', () => {
    for (const m of ['interval', 'tabata', 'emom', 'amrap', 'flow', 'custom'] as const) {
      expect(templateFor(m).prepSeconds).toBe(30);
    }
  });
});
