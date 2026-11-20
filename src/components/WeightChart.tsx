import { useState } from 'react';
import { dateLabel, shortDate } from '../model/format';
import type { WeightUnit } from '../store/history';
import { dayKey } from '../store/stats';

export interface ChartPoint {
  value: number;
  at: number;
}

/** Round axis values that cover [min, max] in about three steps. Never divides by zero on a flat line. */
export function niceScale(min: number, max: number, intervals = 3): { min: number; max: number; ticks: number[] } {
  let lo = min;
  let hi = max;
  if (hi - lo < 1e-9) {
    const pad = Math.max(1, Math.abs(hi) * 0.1);
    lo -= pad;
    hi += pad;
  }
  const raw = (hi - lo) / intervals;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const tmin = Math.floor(lo / step) * step;
  const tmax = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = tmin; t <= tmax + step / 2; t += step) ticks.push(Number(t.toFixed(6)));
  return { min: Number(tmin.toFixed(6)), max: Number(tmax.toFixed(6)), ticks };
}

const W = 320;
const H = 160;
const PAD = { l: 38, r: 16, t: 30, b: 26 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

interface Props {
  exercise: string;
  unit: WeightUnit;
  points: ChartPoint[];
}

/**
 * One exercise's weight over time: a single-series line (no legend; the title says what it is),
 * 2px line, ringed markers, hairline grid, only the latest value labelled, a tooltip on hover and
 * focus, and a table of every value for anyone who prefers numbers.
 */
export function WeightChart({ exercise, unit, points }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  if (n === 0) return null;

  const values = points.map((p) => p.value);
  const scale = niceScale(Math.min(...values), Math.max(...values));
  const t0 = points[0].at;
  const t1 = points[n - 1].at;

  const xOf = (i: number) =>
    n === 1
      ? PAD.l + PLOT_W / 2
      : t1 === t0
        ? PAD.l + (i / (n - 1)) * PLOT_W
        : PAD.l + ((points[i].at - t0) / (t1 - t0)) * PLOT_W;
  const yOf = (v: number) => PAD.t + PLOT_H - ((v - scale.min) / (scale.max - scale.min)) * PLOT_H;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)} ${yOf(p.value).toFixed(1)}`).join(' ');
  const base = PAD.t + PLOT_H;
  const area = `${line} L${xOf(n - 1).toFixed(1)} ${base} L${xOf(0).toFixed(1)} ${base} Z`;

  const last = points[n - 1];
  const lastX = xOf(n - 1);
  const lastY = yOf(last.value);

  const summary =
    n === 1
      ? `${exercise} weight: ${last.value} ${unit} on ${shortDate(last.at)}, 1 session`
      : `${exercise} weight over time: ${points[0].value} ${unit} on ${shortDate(t0)} to ${last.value} ${unit} on ${shortDate(t1)}, ${n} sessions`;

  function track(clientX: number, svg: SVGSVGElement) {
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const x = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(xOf(i) - x) < Math.abs(xOf(best) - x)) best = i;
    setActive(best);
  }

  const tip = active !== null ? points[active] : null;
  const tipPct = active !== null ? Math.min(88, Math.max(12, (xOf(active) / W) * 100)) : 0;

  return (
    <figure className="chart">
      <div className="chart-frame">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-label={summary}
          onMouseMove={(e) => track(e.clientX, e.currentTarget)}
          onPointerMove={(e) => track(e.clientX, e.currentTarget)}
          onMouseLeave={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
        >
          {scale.ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={yOf(t)} y2={yOf(t)} />
              <text className="y-label" x={PAD.l - 8} y={yOf(t) + 3.5} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {n > 1 && <path className="area" d={area} />}
          {n > 1 && <path className="line" d={line} strokeWidth="2" />}
          {active !== null && <line className="crosshair" x1={xOf(active)} x2={xOf(active)} y1={PAD.t} y2={base} />}
          {points.map((p, i) => (
            <g key={i}>
              <circle className="dot" cx={xOf(i)} cy={yOf(p.value)} r={active === i ? 6 : 5} strokeWidth="2" />
              <circle
                className="hit"
                cx={xOf(i)}
                cy={yOf(p.value)}
                r={14}
                tabIndex={0}
                role="img"
                aria-label={`${p.value} ${unit} on ${dateLabel(dayKey(p.at))}`}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            </g>
          ))}
          <text
            className="end-label"
            x={lastX}
            y={lastY - 12}
            textAnchor={lastX > W * 0.6 ? 'end' : 'start'}
          >
            {`${last.value} ${unit}`}
          </text>
          <text className="x-label" x={n === 1 ? lastX : PAD.l} y={H - 6} textAnchor={n === 1 ? 'middle' : 'start'}>
            {shortDate(t0)}
          </text>
          {n > 1 && (
            <text className="x-label" x={W - PAD.r} y={H - 6} textAnchor="end">
              {shortDate(t1)}
            </text>
          )}
        </svg>
        {tip && (
          <div className="chart-tip" role="status" style={{ left: `${tipPct}%` }}>
            <span className="tip-key" aria-hidden />
            <strong>{`${tip.value} ${unit}`}</strong>
            <span className="muted">{dateLabel(dayKey(tip.at))}</span>
          </div>
        )}
      </div>
      <details className="data-view">
        <summary>Show data</summary>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Weight</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i}>
                <td>{dateLabel(dayKey(p.at))}</td>
                <td>{`${p.value} ${unit}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
