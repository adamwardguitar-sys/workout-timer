import { useState } from 'react';
import { Icon } from '../components/Icon';
import { NumberField } from '../components/NumberField';
import { WeightChart } from '../components/WeightChart';
import { WeightFields } from '../components/WeightFields';
import { useHistory } from '../hooks/useHistory';
import { dateLabel, formatDuration, relativeDay } from '../model/format';
import type { ExerciseWeight, Session, WeightUnit } from '../store/history';
import { loadSettings } from '../store/settings';
import { activityGrid, exerciseProgress, groupByDay, thisWeek } from '../store/stats';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Shade by minutes; a day with any session is at least level 1, even if no time was logged. */
const level = (seconds: number, count: number) =>
  count === 0 ? 0 : seconds < 600 ? 1 : seconds < 1800 ? 2 : 3;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function detail(s: Session): string {
  const parts: string[] = [];
  if (!s.manual || s.durationSec > 0) parts.push(formatDuration(s.durationSec));
  if (s.laps > 0) parts.push(plural(s.laps, 'round'));
  else if (s.roundsDone > 0) parts.push(plural(s.roundsDone, 'round'));
  parts.push(new Date(s.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  return parts.join(' · ');
}

const toRecord = (list: ExerciseWeight[] | undefined): Record<string, number | undefined> =>
  Object.fromEntries((list ?? []).map((w) => [w.exercise, w.value]));

interface CardProps {
  s: Session;
  defaultUnit: WeightUnit;
  onNote: (text: string) => void;
  onWeights: (list: ExerciseWeight[], unit: WeightUnit) => void;
  onDuration: (seconds: number) => void;
  onDelete: () => void;
}

function SessionCard({ s, defaultUnit, onNote, onWeights, onDuration, onDelete }: CardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.note ?? '');
  const [editingWeights, setEditingWeights] = useState(false);
  const unit: WeightUnit = s.weights?.length ? (s.unit ?? 'kg') : defaultUnit;
  const [wDraft, setWDraft] = useState<Record<string, number | undefined>>(() => toRecord(s.weights));
  const canWeigh = (s.tracked?.length ?? 0) > 0;
  const [editingTime, setEditingTime] = useState(false);
  const [minutes, setMinutes] = useState<number | undefined>(s.durationSec > 0 ? Math.round(s.durationSec / 60) : undefined);

  function saveWeights() {
    const list = (s.tracked ?? []).filter((ex) => wDraft[ex] !== undefined).map((ex) => ({ exercise: ex, value: wDraft[ex]! }));
    onWeights(list, unit);
    setEditingWeights(false);
  }

  return (
    <article className="session">
      <div className="session-head">
        <strong className="session-name">{s.workoutName}</strong>
        {!s.completed && <span className="badge early">Ended early</span>}
      </div>
      <div className="muted">{detail(s)}</div>

      {editingTime && (
        <div className="note-edit">
          <div className="minutes-row">
            <NumberField min={0} allowEmpty aria-label="Minutes" value={minutes} onChange={setMinutes} />
            <span className="muted">min</span>
          </div>
          <div className="notice-actions">
            <button
              className="btn primary"
              onClick={() => {
                onDuration((minutes ?? 0) * 60);
                setEditingTime(false);
              }}
            >
              Save
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setMinutes(s.durationSec > 0 ? Math.round(s.durationSec / 60) : undefined);
                setEditingTime(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {s.weights && s.weights.length > 0 && !editingWeights && (
        <p className="session-weights">{s.weights.map((w) => `${w.exercise} ${w.value} ${s.unit ?? 'kg'}`).join(' · ')}</p>
      )}
      {editingWeights && (
        <div className="note-edit">
          <WeightFields
            exercises={s.tracked ?? []}
            values={wDraft}
            unit={unit}
            onChange={(ex, v) => setWDraft({ ...wDraft, [ex]: v })}
            onFillAll={(v) => setWDraft(Object.fromEntries((s.tracked ?? []).map((ex) => [ex, v])))}
          />
          <div className="notice-actions">
            <button className="btn primary" onClick={saveWeights}>
              Save
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setWDraft(toRecord(s.weights));
                setEditingWeights(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {editing ? (
        <div className="note-edit">
          <textarea className="note" aria-label="Note" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="notice-actions">
            <button
              className="btn primary"
              onClick={() => {
                onNote(draft);
                setEditing(false);
              }}
            >
              Save
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setDraft(s.note ?? '');
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {s.note && <p className="session-note">{s.note}</p>}
          {!editingWeights && !editingTime && (
            <div className="session-actions">
              {s.manual && (
                <button className="btn ghost small" onClick={() => setEditingTime(true)}>
                  {s.durationSec > 0 ? 'Edit time' : 'Add time'}
                </button>
              )}
              {canWeigh && (
                <button className="btn ghost small" onClick={() => setEditingWeights(true)}>
                  {s.weights?.length ? 'Edit weights' : 'Add weights'}
                </button>
              )}
              <button className="btn ghost small" onClick={() => setEditing(true)}>
                {s.note ? 'Edit note' : 'Add note'}
              </button>
              <button className="btn ghost small danger" onClick={onDelete}>
                Delete session
              </button>
            </div>
          )}
        </>
      )}
    </article>
  );
}

export function History({ now = Date.now() }: { now?: number }) {
  const h = useHistory();
  const defaultUnit = loadSettings().weightUnit;
  const [day, setDay] = useState<string | null>(null);
  const [openChart, setOpenChart] = useState<string | null>(null);

  const week = thisWeek(h.sessions, now);
  const grid = activityGrid(h.sessions, now, 4);
  const month = grid.reduce((n, c) => n + c.count, 0);
  const groups = groupByDay(h.sessions).filter((g) => day === null || g.date === day);
  const progress = exerciseProgress(h.sessions);

  function remove(s: Session) {
    if (window.confirm(`Delete this ${s.workoutName} session from your history?`)) h.remove(s.id);
  }

  return (
    <section className="screen history">
      <header className="screen-head">
        <h1>History</h1>
      </header>

      <div className="tiles">
        <div className="tile" data-testid="tile-week">
          <div className="tile-value">{week.sessions}</div>
          <div className="tile-label">This week</div>
          <div className="tile-sub">{formatDuration(week.seconds)}</div>
        </div>
        <div className="tile" data-testid="tile-month">
          <div className="tile-value">{month}</div>
          <div className="tile-label">Last 4 weeks</div>
          <div className="tile-sub">{(month / 4).toFixed(1)} per week</div>
        </div>
        <div className="tile" data-testid="tile-total">
          <div className="tile-value">{h.sessions.length}</div>
          <div className="tile-label">Total sessions</div>
        </div>
      </div>

      <h2>Last 4 weeks</h2>
      <div className="week-letters" aria-hidden>
        {WEEKDAY_LETTERS.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
      <div className="grid" aria-label="Last 4 weeks">
        {grid.map((c) => (
          <button
            key={c.date}
            className={`cell${c.future ? ' future' : ''}${day === c.date ? ' selected' : ''}`}
            data-level={level(c.seconds, c.count)}
            disabled={c.future || c.count === 0}
            aria-pressed={day === c.date}
            onClick={() => setDay(day === c.date ? null : c.date)}
            aria-label={`${dateLabel(c.date)}: ${
              c.future ? 'upcoming' : c.count === 0 ? 'no sessions' : `${plural(c.count, 'session')}, ${formatDuration(c.seconds)}`
            }`}
          />
        ))}
      </div>
      {day !== null && (
        <button className="btn ghost small" onClick={() => setDay(null)}>
          Show all
        </button>
      )}

      {progress.length > 0 && (
        <section aria-label="Exercise weights" className="progress">
          <h2>Exercise weights</h2>
          <ul className="progress-list">
            {progress.map((p) => {
              const summary = (
                <>
                  <strong>{p.exercise}</strong>
                  <span className="progress-value">
                    {p.latest.value} {p.latest.unit}
                  </span>
                  <span className="muted">
                    {p.previous
                      ? `${p.latest.value > p.previous.value ? 'up' : 'down'} from ${p.previous.value} ${p.previous.unit} · ${relativeDay(p.latest.at, now).toLowerCase()}`
                      : `first logged ${relativeDay(p.latest.at, now).toLowerCase()}`}
                  </span>
                </>
              );
              const open = openChart === p.exercise;
              return (
                <li key={p.exercise} className={open ? 'open' : undefined}>
                  {p.points.length > 1 ? (
                    <button
                      className="progress-row"
                      aria-expanded={open}
                      onClick={() => setOpenChart(open ? null : p.exercise)}
                    >
                      {summary}
                      <span className="chev" aria-hidden>
                        <Icon name="chevron" size={18} />
                      </span>
                    </button>
                  ) : (
                    <div className="progress-row">{summary}</div>
                  )}
                  {open && <WeightChart exercise={p.exercise} unit={p.latest.unit} points={p.points} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {h.sessions.length > 0 &&
        groups.map((g) => (
          <div key={g.date} className="day-group">
            <h2>
              {relativeDay(g.sessions[0].startedAt, now)} · {dateLabel(g.date)}
            </h2>
            {g.sessions.map((s) => (
              <SessionCard
                key={s.id}
                s={s}
                defaultUnit={defaultUnit}
                onNote={(t) => h.note(s.id, t)}
                onWeights={(list, unit) => h.weights(s.id, list, unit)}
                onDuration={(secs) => h.duration(s.id, secs)}
                onDelete={() => remove(s)}
              />
            ))}
          </div>
        ))}
    </section>
  );
}
