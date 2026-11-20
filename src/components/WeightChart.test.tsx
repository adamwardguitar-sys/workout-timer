import { fireEvent, render, screen, within } from '@testing-library/react';
import { WeightChart, niceScale } from './WeightChart';

const at = (m: number, d: number) => new Date(2026, m - 1, d, 9).getTime();
const points = [
  { value: 12, at: at(11, 2) },
  { value: 14, at: at(11, 9) },
  { value: 16, at: at(11, 16) },
];

const setup = (pts = points) => render(<WeightChart exercise="Goblet Squat" unit="kg" points={pts} />);

describe('niceScale', () => {
  it('gives round ticks that cover the data', () => {
    expect(niceScale(12, 16)).toEqual({ min: 12, max: 16, ticks: [12, 14, 16] });
  });
  it('handles a flat line without dividing by zero', () => {
    const s = niceScale(16, 16);
    expect(s.min).toBeLessThan(16);
    expect(s.max).toBeGreaterThan(16);
    expect(s.ticks.length).toBeGreaterThanOrEqual(2);
    expect(s.ticks.length).toBeLessThanOrEqual(5);
    expect(s.ticks.every(Number.isFinite)).toBe(true);
  });
  it('covers decimals', () => {
    const s = niceScale(20, 22.5);
    expect(s.min).toBeLessThanOrEqual(20);
    expect(s.max).toBeGreaterThanOrEqual(22.5);
  });
});

describe('WeightChart', () => {
  it('is a labelled group with a plain-language summary', () => {
    setup();
    expect(
      screen.getByRole('group', { name: 'Goblet Squat weight over time: 12 kg on 2 Nov to 16 kg on 16 Nov, 3 sessions' }),
    ).toBeInTheDocument();
  });

  it('draws a 2px line and one 8px+ marker with a 2px surface ring per session', () => {
    const { container } = setup();
    const line = container.querySelector('path.line')!;
    expect(line.getAttribute('stroke-width')).toBe('2');
    expect(line.getAttribute('d')).not.toMatch(/NaN/);
    const dots = container.querySelectorAll('circle.dot');
    expect(dots).toHaveLength(3);
    for (const d of dots) {
      expect(Number(d.getAttribute('r'))).toBeGreaterThanOrEqual(4);
      expect(d.getAttribute('stroke-width')).toBe('2');
    }
  });

  it('labels only the latest value on the chart, in text colour rather than the series colour', () => {
    const { container } = setup();
    const labels = [...container.querySelectorAll('text.end-label')];
    expect(labels).toHaveLength(1);
    expect(labels[0].textContent).toBe('16 kg');
    expect(labels[0].getAttribute('fill')).not.toBe('var(--chart-1)');
  });

  it('labels the first and last dates and has round y ticks', () => {
    const { container } = setup();
    const x = [...container.querySelectorAll('text.x-label')].map((t) => t.textContent);
    expect(x).toEqual(['2 Nov', '16 Nov']);
    const y = [...container.querySelectorAll('text.y-label')].map((t) => t.textContent);
    expect(y).toEqual(['12', '14', '16']);
  });

  it('has a tooltip on focus (keyboard) with the value first and the date after it', () => {
    setup();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    const dots = screen.getAllByRole('img', { name: /kg on/ });
    expect(dots).toHaveLength(3);
    fireEvent.focus(dots[1]);
    const tip = screen.getByRole('status');
    expect(tip).toHaveTextContent('14 kg');
    expect(tip).toHaveTextContent('Mon 9 Nov');
    expect(tip.textContent!.indexOf('14 kg')).toBeLessThan(tip.textContent!.indexOf('Mon 9 Nov'));
    fireEvent.blur(dots[1]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the nearest session as the pointer moves, and hides it when the pointer leaves', () => {
    const { container } = setup();
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 320, height: 150, right: 320, bottom: 150, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.mouseMove(svg, { clientX: 300 }); // far right: the last session
    expect(screen.getByRole('status')).toHaveTextContent('16 kg');
    fireEvent.mouseMove(svg, { clientX: 40 }); // far left: the first
    expect(screen.getByRole('status')).toHaveTextContent('12 kg');
    fireEvent.mouseLeave(svg);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('gives each marker a hit area of at least 24px', () => {
    const { container } = setup();
    const hit = container.querySelectorAll('circle.hit');
    expect(hit).toHaveLength(3);
    for (const h of hit) expect(Number(h.getAttribute('r')) * 2).toBeGreaterThanOrEqual(24);
  });

  it('has a table view with every value', () => {
    setup();
    const details = screen.getByText('Show data').closest('details')!;
    const rows = within(details).getAllByRole('row');
    expect(rows).toHaveLength(4); // header + 3
    expect(within(details).getByText('12 kg')).toBeInTheDocument();
    expect(within(details).getByText('Mon 16 Nov')).toBeInTheDocument();
  });

  it('copes with a flat line (same weight every time) and with a single session', () => {
    const flat = setup(points.map((p) => ({ ...p, value: 16 })));
    expect(flat.container.querySelector('path.line')!.getAttribute('d')).not.toMatch(/NaN/);
    flat.unmount();
    const one = setup([points[0]]);
    expect(one.container.querySelector('path.line')).toBeNull();
    expect(one.container.querySelectorAll('circle.dot')).toHaveLength(1);
    expect(one.container.innerHTML).not.toMatch(/NaN/);
  });

  it('shows names and values as text, never as markup', () => {
    render(<WeightChart exercise={'<img src=x onerror=alert(1)>'} unit="kg" points={points} />);
    expect(document.querySelector('img')).toBeNull();
  });
});
