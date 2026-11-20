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
import { useLibrary } from '../hooks/useLibrary';
import { MODE_BLURBS, MODE_LABELS, formatTime, relativeDay } from '../model/format';
import { validateWorkout } from '../model/segments';
import { templateFor } from '../model/templates';
import { loadActiveRun } from '../store/activeRun';
import { loadHistory } from '../store/history';
import { workoutStats } from '../store/stats';
import { clearCorrupt, listCorrupt } from '../store/library';
import { saveTextFile } from '../util/download';
import type { Mode, Workout } from '../model/types';
import type { Navigate } from '../route';

const MODES: Mode[] = ['interval', 'tabata', 'emom', 'amrap', 'flow', 'custom'];

function summary(w: Workout): string {
  const parts = [`${w.steps.length} ${w.steps.length === 1 ? 'step' : 'steps'}`];
  parts.push(w.rounds === null ? 'until I stop' : `${w.rounds} ${w.rounds === 1 ? 'round' : 'rounds'}`);
  if (w.restBetweenRounds > 0) parts.push(`${formatTime(w.restBetweenRounds)} rest`);
  return parts.join(' · ');
}

interface CardProps {
  w: Workout;
  index: number;
  navigate: Navigate;
  last?: { count: number; lastAt: number };
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
      <button className="handle" aria-label={`Reorder ${name}`} {...attributes} {...listeners}>
        ⠿
      </button>
      <div className="card-main">
        <button className="card-title" onClick={() => navigate({ name: 'editor', id: w.id })}>
          {name}
        </button>
        <div className="card-meta">
          <span className="badge">{MODE_LABELS[w.mode]}</span>
          <span>{summary(w)}</span>
        </div>
        {last && (
          <div className="card-last muted">
            Last done {relativeDay(last.lastAt, Date.now()).toLowerCase()} · {last.count}{' '}
            {last.count === 1 ? 'session' : 'sessions'}
          </div>
        )}
      </div>
      <div className="card-actions">
        <button className="btn primary" disabled={invalid} onClick={() => navigate({ name: 'run', id: w.id })}>
          <span aria-hidden>▶</span>
          <span className="sr-only">Start {name}</span>
        </button>
        <button className="btn ghost" onClick={onDuplicate}>
          <span aria-hidden>⧉</span>
          <span className="sr-only">Duplicate {name}</span>
        </button>
        <button className="btn ghost danger" onClick={onDelete}>
          <span aria-hidden>🗑</span>
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
  const [stats] = useState(() => workoutStats(loadHistory()));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  return (
    <section className="screen">
      <header className="screen-head">
        <h1>Library</h1>
      </header>

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

      {savedRun && (
        <button className="btn resume wide" onClick={() => navigate({ name: 'run', id: savedRun.workout.id, resume: true })}>
          Resume workout · {savedRun.workout.name.trim() || 'Untitled'}
        </button>
      )}

      <button className="btn primary wide" onClick={() => setPicking(true)}>
        New workout
      </button>

      {picking && (
        <div className="sheet-backdrop" onClick={() => setPicking(false)}>
          <div className="sheet" role="dialog" aria-label="Choose a mode" onClick={(e) => e.stopPropagation()}>
            <h2>Choose a mode</h2>
            <ul className="mode-list">
              {MODES.map((m) => (
                <li key={m}>
                  <button className="mode-option" onClick={() => create(m)}>
                    <strong>{MODE_LABELS[m]}</strong>
                    <span>{MODE_BLURBS[m]}</span>
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
      {lib.workouts.length === 0 && <p className="empty">No workouts yet. Tap “New workout” to make one.</p>}
    </section>
  );
}
