import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icon, MODE_ICONS } from '../components/Icon';
import { useLibrary } from '../hooks/useLibrary';
import { MODE_LABELS, dateLabel, formatDuration, formatTime, relativeDay } from '../model/format';
import { estimateSeconds, validateWorkout } from '../model/segments';
import { templateFor } from '../model/templates';
import type { Mode, Workout } from '../model/types';
import type { Navigate } from '../route';
import { loadActiveRun } from '../store/activeRun';
import { loadHistory } from '../store/history';
import { clearCorrupt, listCorrupt } from '../store/library';
import { activityGrid, dayKey, workoutStats } from '../store/stats';
import { saveTextFile } from '../util/download';

const MAIN_MODES: Mode[] = ['interval', 'flow'];
const PRESET_MODES: Mode[] = ['tabata', 'emom', 'amrap'];
const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Short facts about a workout: mode, how long it runs (when that is known), size, rounds. */
function chips(w: Workout): string[] {
  const out: string[] = [];
  const est = estimateSeconds(w);
  if (est !== null) out.push(`≈ ${formatDuration(est)}`);
  out.push(plural(w.steps.length, w.mode === 'flow' ? 'exercise' : 'step'));
  if (w.rounds === null) out.push('until I stop');
  else if (w.rounds > 1) out.push(plural(w.rounds, 'round'));
  if (w.mode === 'flow' && w.restBetweenRounds > 0) out.push(`${formatTime(w.restBetweenRounds)} rest`);
  return out;
}

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type Last = { count: number; lastAt: number };

function LastDone({ last }: { last: Last }) {
  return (
    <div className="card-last muted">
      Last done {relativeDay(last.lastAt, Date.now()).toLowerCase()} · {plural(last.count, 'session')}
    </div>
  );
}

interface CardProps {
  w: Workout;
  index: number;
  navigate: Navigate;
  last?: Last;
  onDuplicate: () => void;
  onDelete: () => void;
}

function WorkoutCard({ w, index, navigate, last, onDuplicate, onDelete }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id });
  const name = w.name.trim() || 'Untitled';
  const invalid = validateWorkout(w).length > 0;
  return (
    <li
      ref={setNodeRef}
      data-card-index={index}
      className={`card${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="card-top">
        <div className="mode-tile" data-mode={w.mode}>
          <Icon name={MODE_ICONS[w.mode]} size={26} />
        </div>
        <div className="card-main">
          <button className="card-title" onClick={() => navigate({ name: 'editor', id: w.id })}>
            {name}
          </button>
          <div className="chips">
            <span className="badge">{MODE_LABELS[w.mode]}</span>
            {chips(w).map((c) => (
              <span key={c} className="chip">
                {c}
              </span>
            ))}
          </div>
          {last && <LastDone last={last} />}
        </div>
        <button
          className="btn primary play"
          disabled={invalid}
          onClick={() => navigate({ name: 'run', id: w.id })}
        >
          <Icon name="play" size={24} />
          <span className="sr-only">Start {name}</span>
        </button>
      </div>
      <div className="card-foot">
        <button className="handle" aria-label={`Reorder ${name}`} {...attributes} {...listeners}>
          <Icon name="grip" />
        </button>
        <span className="spacer" />
        <button className="btn ghost icon" onClick={onDuplicate}>
          <Icon name="copy" />
          <span className="sr-only">Duplicate {name}</span>
        </button>
        <button className="btn ghost icon danger" onClick={onDelete}>
          <Icon name="trash" />
          <span className="sr-only">Delete {name}</span>
        </button>
      </div>
    </li>
  );
}

export function Library({ navigate }: { navigate: Navigate }) {
  const lib = useLibrary();
  const [picking, setPicking] = useState(false);
  const [savedRun] = useState(() => loadActiveRun());
  const [corrupt, setCorrupt] = useState(() => listCorrupt());
  const [sessions] = useState(() => loadHistory());
  const stats = workoutStats(sessions);
  const now = Date.now();
  const weekCells = activityGrid(sessions, now, 1);
  const todayKey = dayKey(now);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // "Up next": the workout you did most recently, or the first one if you have not done any yet
  const featured = lib.workouts.reduce<Workout | undefined>((best, w) => {
    const at = stats.get(w.id)?.lastAt ?? 0;
    const bestAt = best ? (stats.get(best.id)?.lastAt ?? 0) : -1;
    return at > bestAt ? w : best;
  }, undefined);

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = lib.workouts.findIndex((w) => w.id === e.active.id);
    const to = lib.workouts.findIndex((w) => w.id === e.over!.id);
    lib.move(from, to);
  }

  function create(mode: Mode) {
    const w = templateFor(mode);
    lib.save(w);
    setPicking(false);
    navigate({ name: 'editor', id: w.id });
  }

  function downloadUnreadable() {
    void saveTextFile(
      'workout-timer-unreadable-data.json',
      JSON.stringify({ app: 'workout-timer-unreadable', entries: corrupt }, null, 2),
    );
  }

  function dismissUnreadable() {
    if (window.confirm('Forget the unreadable data? Download it first if you want to keep it.')) {
      clearCorrupt();
      setCorrupt([]);
    }
  }

  function confirmDelete(w: Workout) {
    if (window.confirm(`Delete "${w.name.trim() || 'Untitled'}"? This can't be undone.`)) lib.remove(w.id);
  }

  const featuredName = featured ? featured.name.trim() || 'Untitled' : '';

  return (
    <section className="screen home">
      <header className="home-head">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="timer" size={20} />
          </span>
          Workout Timer
        </div>
        <div className="greeting" data-testid="greeting">
          {greeting(new Date(now).getHours())}
        </div>
      </header>

      <div className="week-strip" aria-label="This week">
        {weekCells.map((c, i) => {
          const isToday = c.date === todayKey;
          return (
            <div key={c.date} className="week-day">
              <div
                role="img"
                className={`dot${c.count > 0 ? ' trained' : ''}${isToday ? ' today' : ''}${c.future ? ' future' : ''}`}
                aria-label={`${dateLabel(c.date)}: ${c.count > 0 ? 'trained' : c.future ? 'upcoming' : 'no session'}${isToday ? ' (today)' : ''}`}
              >
                {c.count > 0 && <Icon name="play" size={12} />}
              </div>
              <span className={isToday ? 'letter today' : 'letter'}>{WEEKDAY_LETTERS[i]}</span>
            </div>
          );
        })}
      </div>

      {savedRun ? (
        <section className="hero hero-resume" aria-label="Up next">
          <div className="eyebrow">In progress</div>
          <div className="hero-title">{savedRun.workout.name.trim() || 'Untitled'}</div>
          <button
            className="btn primary huge"
            onClick={() => navigate({ name: 'run', id: savedRun.workout.id, resume: true })}
          >
            <Icon name="play" size={24} />
            Resume workout · {savedRun.workout.name.trim() || 'Untitled'}
          </button>
        </section>
      ) : (
        featured && (
          <section className="hero" aria-label="Up next">
            <div className="eyebrow">Up next</div>
            <div className="hero-title">{featuredName}</div>
            <div className="chips">
              <span className="badge">{MODE_LABELS[featured.mode]}</span>
              {chips(featured).map((c) => (
                <span key={c} className="chip">
                  {c}
                </span>
              ))}
            </div>
            {stats.get(featured.id) && <LastDone last={stats.get(featured.id)!} />}
            <button
              className="btn primary huge"
              aria-label={`Quick start ${featuredName}`}
              disabled={validateWorkout(featured).length > 0}
              onClick={() => navigate({ name: 'run', id: featured.id })}
            >
              <Icon name="play" size={24} />
              Start
            </button>
          </section>
        )
      )}

      <div className="section-head">
        <h1>Library</h1>
        <button className="btn" onClick={() => setPicking(true)}>
          <Icon name="plus" size={20} />
          New workout
        </button>
      </div>

      {corrupt.length > 0 && (
        <div className="notice" role="status">
          <p>Some saved workouts could not be read. A copy of the unreadable data has been kept.</p>
          <div className="notice-actions">
            <button className="btn" onClick={downloadUnreadable}>
              Download unreadable data
            </button>
            <button className="btn ghost" onClick={dismissUnreadable}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {picking && (
        <div className="sheet-backdrop" onClick={() => setPicking(false)}>
          <div className="sheet" role="dialog" aria-label="Choose a mode" onClick={(e) => e.stopPropagation()}>
            <h2>Choose a mode</h2>
            <ul className="mode-list">
              {MAIN_MODES.map((m) => (
                <li key={m}>
                  <button className="mode-option" onClick={() => create(m)}>
                    <span className="mode-tile small" data-mode={m}>
                      <Icon name={MODE_ICONS[m]} size={22} />
                    </span>
                    <span className="mode-text">
                      <strong>{MODE_LABELS[m]}</strong>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <h3 className="preset-title">Quick presets</h3>
            <ul className="mode-list">
              {PRESET_MODES.map((m) => (
                <li key={m}>
                  <button className="mode-option" onClick={() => create(m)}>
                    <span className="mode-tile small" data-mode={m}>
                      <Icon name={MODE_ICONS[m]} size={22} />
                    </span>
                    <span className="mode-text">
                      <strong>{MODE_LABELS[m]}</strong>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn ghost wide" onClick={() => setPicking(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={lib.workouts.map((w) => w.id)} strategy={verticalListSortingStrategy}>
          <ul className="card-list">
            {lib.workouts.map((w, i) => (
              <WorkoutCard
                key={w.id}
                w={w}
                index={i}
                navigate={navigate}
                last={stats.get(w.id)}
                onDuplicate={() => lib.duplicate(w.id)}
                onDelete={() => confirmDelete(w)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  );
}
