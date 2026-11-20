import { useState } from 'react';
import { useHistory } from '../hooks/useHistory';
import { dateLabel, formatDuration, relativeDay } from '../model/format';
import type { Session } from '../store/history';
import { activityGrid, groupByDay, streakDays, thisWeek } from '../store/stats';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const level = (seconds: number) => (seconds === 0 ? 0 : seconds < 600 ? 1 : seconds < 1800 ? 2 : 3);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function detail(s: Session): string {
  const parts = [formatDuration(s.durationSec)];
  if (s.laps > 0) parts.push(plural(s.laps, 'round'));
  else if (s.roundsDone > 0) parts.push(plural(s.roundsDone, 'round'));
  parts.push(new Date(s.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  return parts.join(' · ');
}

function SessionCard({ s, onNote, onDelete }: { s: Session; onNote: (text: string) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.note ?? '');
  return (
    <article className="session">
      <div className="session-head">
        <strong className="session-name">{s.workoutName}</strong>
        {!s.completed && <span className="badge early">Ended early</span>}
      </div>
      <div className="muted">{detail(s)}</div>
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
          <div className="session-actions">
            <button className="btn ghost small" onClick={() => setEditing(true)}>
              {s.note ? 'Edit note' : 'Add note'}
            </button>
            <button className="btn ghost small danger" onClick={onDelete}>
              Delete session
            </button>
          </div>
        </>
      )}
    </article>
  );
}

export function History({ now = Date.now() }: { now?: number }) {
  const h = useHistory();
  const week = thisWeek(h.sessions, now);
  const streak = streakDays(h.sessions, now);
  const grid = activityGrid(h.sessions, now, 4);
  const groups = groupByDay(h.sessions);

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
        <div className="tile" data-testid="tile-streak">
          <div className="tile-value">{streak}</div>
          <div className="tile-label">Day streak</div>
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
          <div
            key={c.date}
            role="img"
            className={`cell${c.future ? ' future' : ''}`}
            data-level={level(c.seconds)}
            aria-label={`${dateLabel(c.date)}: ${
              c.future ? 'upcoming' : c.count === 0 ? 'no sessions' : `${plural(c.count, 'session')}, ${formatDuration(c.seconds)}`
            }`}
          />
        ))}
      </div>

      {h.sessions.length === 0 ? (
        <p className="empty">No sessions yet. Finish a workout and it will show up here.</p>
      ) : (
        groups.map((g) => (
          <div key={g.date} className="day-group">
            <h2>
              {relativeDay(g.sessions[0].startedAt, now)} · {dateLabel(g.date)}
            </h2>
            {g.sessions.map((s) => (
              <SessionCard key={s.id} s={s} onNote={(t) => h.note(s.id, t)} onDelete={() => remove(s)} />
            ))}
          </div>
        ))
      )}
    </section>
  );
}
