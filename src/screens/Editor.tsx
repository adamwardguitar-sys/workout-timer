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
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLibrary } from '../hooks/useLibrary';
import { MODE_LABELS } from '../model/format';
import { newId } from '../model/id';
import { validateWorkout } from '../model/segments';
import type { Step, Workout } from '../model/types';
import type { Navigate, Route } from '../route';

const toInt = (v: string) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function TimeField(props: { label: string; seconds: number; onChange: (seconds: number) => void; disabled?: boolean }) {
  const { label, seconds, onChange, disabled } = props;
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return (
    <div className="time-field">
      <span className="field-label">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        aria-label={`${label} minutes`}
        disabled={disabled}
        value={m}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(toInt(e.target.value) * 60 + s)}
      />
      <span aria-hidden>:</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        aria-label={`${label} seconds`}
        disabled={disabled}
        value={String(s).padStart(2, '0')}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(m * 60 + toInt(e.target.value))}
      />
    </div>
  );
}

interface RowProps {
  step: Step;
  n: number;
  amrap: boolean;
  locked: boolean;
  onChange: (s: Step) => void;
  onRemove: () => void;
}

function StepRow({ step, n, amrap, locked, onChange, onRemove }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
    disabled: locked,
  });
  const set = (patch: Partial<Step>) => onChange({ ...step, ...patch });
  return (
    <li
      ref={setNodeRef}
      data-step-index={n - 1}
      className={`step-row${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button className="handle" aria-label={`Reorder step ${n}`} disabled={locked} {...attributes} {...listeners}>
        ⠿
      </button>
      <div className="step-fields">
        <input
          className="step-name"
          placeholder="Exercise name"
          aria-label={`Step ${n} name`}
          value={step.label}
          onChange={(e) => set({ label: e.target.value })}
        />
        <div className="step-options">
          <select
            aria-label={`Step ${n} type`}
            disabled={locked}
            value={step.kind}
            onChange={(e) =>
              e.target.value === 'tap'
                ? set({ kind: 'tap' })
                : set({ kind: 'timed', seconds: step.seconds ?? 30 })
            }
          >
            <option value="timed">Timed</option>
            <option value="tap">Tap when done</option>
          </select>
          <select
            aria-label={`Step ${n} role`}
            disabled={locked}
            value={step.role}
            onChange={(e) => set({ role: e.target.value as Step['role'] })}
          >
            <option value="work">Work</option>
            <option value="rest">Rest</option>
          </select>
          {step.kind === 'timed' && (
            <TimeField
              label={`Step ${n} time`}
              seconds={step.seconds ?? 0}
              disabled={locked}
              onChange={(seconds) => set({ seconds })}
            />
          )}
          {step.kind === 'tap' && step.role === 'work' && (
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="Reps"
              className="reps"
              aria-label={`Step ${n} reps`}
              value={step.reps ?? ''}
              onChange={(e) => set({ reps: e.target.value === '' ? undefined : toInt(e.target.value) })}
            />
          )}
          {amrap && step.kind === 'timed' && (
            <label className="check">
              <input
                type="checkbox"
                aria-label={`Step ${n} counts rounds`}
                checked={!!step.counter}
                onChange={(e) => set({ counter: e.target.checked })}
              />
              Count rounds
            </label>
          )}
        </div>
      </div>
      <button className="btn ghost danger" onClick={onRemove} disabled={locked}>
        <span aria-hidden>✕</span>
        <span className="sr-only">Remove step {n}</span>
      </button>
    </li>
  );
}

export function Editor({ id, navigate }: { id: string; navigate: Navigate }) {
  const lib = useLibrary();
  const w = lib.workouts.find((x) => x.id === id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!w) {
    return (
      <section className="screen">
        <p>Workout not found</p>
        <button className="btn" onClick={() => navigate({ name: 'library' })}>
          Back to library
        </button>
      </section>
    );
  }

  const update = (patch: Partial<Workout>) => lib.save({ ...w, ...patch });
  const setStep = (s: Step) => update({ steps: w.steps.map((x) => (x.id === s.id ? s : x)) });
  const errors = validateWorkout(w);
  const hasTap = w.steps.some((s) => s.kind === 'tap');
  const locked = w.mode === 'tabata';

  const nameFix = () => {
    if (!w.name.trim()) update({ name: 'Untitled' });
  };
  const leave = (route: Route) => {
    nameFix();
    navigate(route);
  };

  function onDragEnd(e: DragEndEvent) {
    if (locked || !e.over || e.active.id === e.over.id) return;
    const from = w!.steps.findIndex((s) => s.id === e.active.id);
    const to = w!.steps.findIndex((s) => s.id === e.over!.id);
    update({ steps: arrayMove(w!.steps, from, to) });
  }

  function addStep() {
    const n = w!.steps.length + 1;
    const step: Step =
      w!.mode === 'flow'
        ? { id: newId(), label: `Exercise ${n}`, kind: 'tap', role: 'work' }
        : { id: newId(), label: `Exercise ${n}`, kind: 'timed', role: 'work', seconds: 30 };
    update({ steps: [...w!.steps, step] });
  }

  return (
    <section className="screen editor">
      <header className="screen-head">
        <button className="btn ghost" onClick={() => leave({ name: 'library' })}>
          <span aria-hidden>←</span>
          <span className="sr-only">Back to library</span>
        </button>
        <span className="badge">{MODE_LABELS[w.mode]}</span>
        <button className="btn primary" disabled={errors.length > 0} onClick={() => leave({ name: 'run', id: w.id })}>
          Start
        </button>
      </header>

      {locked && (
        <div className="notice">
          <p>Tabata is fixed at 20s on, 10s off, 8 rounds. Convert to Custom to change it.</p>
          <button className="btn" onClick={() => update({ mode: 'custom' })}>
            Convert to Custom
          </button>
        </div>
      )}

      <label className="field">
        <span className="field-label">Name</span>
        <input value={w.name} onChange={(e) => update({ name: e.target.value })} onBlur={nameFix} />
      </label>

      <div className="settings-grid">
        <TimeField label="Get ready" seconds={w.prepSeconds} onChange={(prepSeconds) => update({ prepSeconds })} />
        {(w.mode === 'interval' || w.mode === 'custom') && (
          <TimeField
            label="Rest after each exercise"
            seconds={w.restBetweenSteps ?? 0}
            onChange={(restBetweenSteps) => update({ restBetweenSteps })}
          />
        )}
        <TimeField
          label="Rest between rounds"
          seconds={w.restBetweenRounds}
          disabled={locked}
          onChange={(restBetweenRounds) => update({ restBetweenRounds })}
        />
        <div className="rounds-field">
          <span className="field-label">Rounds</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            aria-label="Rounds"
            disabled={w.rounds === null || locked}
            value={w.rounds ?? ''}
            onChange={(e) => update({ rounds: toInt(e.target.value) })}
          />
          <label className="check">
            <input
              type="checkbox"
              aria-label="Until I stop"
              disabled={locked}
              checked={w.rounds === null}
              onChange={(e) => update({ rounds: e.target.checked ? null : 3 })}
            />
            Until I stop
          </label>
        </div>
        {w.mode !== 'amrap' && !locked && w.rounds !== 1 && (
          <label className="check">
            <input
              type="checkbox"
              aria-label="Wait for a tap between rounds"
              checked={!!w.waitBetweenRounds}
              onChange={(e) => update({ waitBetweenRounds: e.target.checked })}
            />
            Wait for a tap between rounds
          </label>
        )}
        {hasTap && (
          <fieldset className="advance">
            <legend className="field-label">Tap behaviour</legend>
            <label className="check">
              <input
                type="radio"
                name="advance"
                aria-label="Tap per exercise"
                checked={w.advance === 'step'}
                onChange={() => update({ advance: 'step' })}
              />
              Tap per exercise
            </label>
            <label className="check">
              <input
                type="radio"
                name="advance"
                aria-label="Tap once per round"
                checked={w.advance === 'round'}
                onChange={() => update({ advance: 'round' })}
              />
              Tap once per round
            </label>
          </fieldset>
        )}
      </div>

      <h2>Steps</h2>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={w.steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ol className="step-list">
            {w.steps.map((s, i) => (
              <StepRow
                key={s.id}
                step={s}
                n={i + 1}
                amrap={w.mode === 'amrap'}
                locked={locked}
                onChange={setStep}
                onRemove={() => update({ steps: w.steps.filter((x) => x.id !== s.id) })}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <button className="btn wide" onClick={addStep} disabled={locked}>
        Add step
      </button>

      {errors.length > 0 && (
        <ul className="errors" aria-live="polite">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
