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
import { useState } from 'react';
import { useLibrary } from '../hooks/useLibrary';
import { Icon } from '../components/Icon';
import { NumberField } from '../components/NumberField';
import { MODE_LABELS } from '../model/format';
import { newId } from '../model/id';
import { validateWorkout } from '../model/segments';
import type { RoundTime, Step, Workout } from '../model/types';
import type { Navigate, Route } from '../route';

function TimeField(props: {
  label: string;
  seconds: number;
  onChange: (seconds: number) => void;
  disabled?: boolean;
  /** Visually hide the label (it stays for screen readers); used inside step rows. */
  compact?: boolean;
}) {
  const { label, seconds, onChange, disabled, compact } = props;
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return (
    <div className={`time-field${compact ? ' compact' : ''}`}>
      <span className={compact ? 'sr-only' : 'field-label'}>{label}</span>
      <NumberField
        min={0}
        aria-label={`${label} minutes`}
        disabled={disabled}
        value={m}
        onChange={(n) => onChange((n ?? 0) * 60 + s)}
      />
      <span aria-hidden>:</span>
      <NumberField
        min={0}
        aria-label={`${label} seconds`}
        disabled={disabled}
        pad={2}
        value={s}
        onChange={(n) => onChange(m * 60 + (n ?? 0))}
      />
    </div>
  );
}

interface RowProps {
  step: Step;
  n: number;
  amrap: boolean;
  /** Show the step type and role pickers (they live inside the Advanced fold-out). */
  advanced: boolean;
  locked: boolean;
  onChange: (s: Step) => void;
  onRemove: () => void;
}

function StepRow({ step, n, amrap, advanced, locked, onChange, onRemove }: RowProps) {
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
        <Icon name="grip" />
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
          {advanced && (
            <>
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
            </>
          )}
          {step.kind === 'timed' && (
            <TimeField
              compact
              label={`Step ${n} time`}
              seconds={step.seconds ?? 0}
              disabled={locked}
              onChange={(seconds) => set({ seconds })}
            />
          )}
          {step.kind === 'tap' && step.role === 'work' && (
            <NumberField
              min={0}
              placeholder="Reps"
              className="reps"
              aria-label={`Step ${n} reps`}
              allowEmpty
              value={step.reps}
              onChange={(reps) => set({ reps })}
            />
          )}
          {step.role === 'work' && (
            <label className="check track-weight">
              <input
                type="checkbox"
                aria-label={`Step ${n} track weight`}
                checked={!!step.weighted}
                onChange={(e) => set({ weighted: e.target.checked })}
              />
              Track weight
            </label>
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
        <Icon name="close" />
        <span className="sr-only">Remove step {n}</span>
      </button>
    </li>
  );
}

/** Same shape as before, with `n` rounds: extra rounds copy the last one, surplus rounds are dropped. */
function resizeRoundTimes(rt: RoundTime[], n: number): RoundTime[] {
  if (n <= rt.length) return rt.slice(0, n);
  const last = rt[rt.length - 1] ?? {};
  return [...rt, ...Array.from({ length: n - rt.length }, () => ({ ...last }))];
}

function AdvancedOptions({ w, update, locked }: { w: Workout; update: (patch: Partial<Workout>) => void; locked: boolean }) {
  const hasTap = w.steps.some((s) => s.kind === 'tap');
  const timedMode = (w.mode === 'interval' || w.mode === 'custom') && !locked;
  const rounds = w.rounds ?? 0;
  const firstWork = w.steps.find((s) => s.kind === 'timed' && s.role === 'work' && !s.counter)?.seconds ?? 40;
  const custom = w.roundTimes !== undefined;

  const setRound = (i: number, patch: RoundTime) =>
    update({ roundTimes: (w.roundTimes ?? []).map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <div className="advanced-panel" id="advanced-panel">
      {timedMode && (
        <>
          <label className="switch">
            <input
              type="checkbox"
              aria-label="Custom times per round"
              checked={custom}
              disabled={w.rounds === null || rounds < 1}
              onChange={(e) =>
                update({
                  roundTimes: e.target.checked
                    ? Array.from({ length: rounds }, () => ({ work: firstWork, rest: w.restBetweenSteps ?? 0 }))
                    : undefined,
                })
              }
            />
            <span className="switch-track" aria-hidden />
            Custom times per round
          </label>
          {custom && (
            <div className="round-table">
              <div className="round-table-head">
                <span />
                <span className="field-label">Work</span>
                <span className="field-label">Rest</span>
              </div>
              {(w.roundTimes ?? []).map((r, i) => (
                <div className="round-row" key={i}>
                  <span className="round-name">Round {i + 1}</span>
                  <TimeField
                    compact
                    label={`Round ${i + 1} work`}
                    seconds={r.work ?? firstWork}
                    onChange={(work) => setRound(i, { work })}
                  />
                  <TimeField
                    compact
                    label={`Round ${i + 1} rest`}
                    seconds={r.rest ?? w.restBetweenSteps ?? 0}
                    onChange={(rest) => setRound(i, { rest })}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {w.mode !== 'amrap' && !locked && w.rounds !== 1 && (
        <label className="switch">
          <input
            type="checkbox"
            aria-label="Wait for a tap between rounds"
            checked={!!w.waitBetweenRounds}
            onChange={(e) => update({ waitBetweenRounds: e.target.checked })}
          />
          <span className="switch-track" aria-hidden />
          Wait for a tap between rounds
        </label>
      )}

      {hasTap && (
        <fieldset className="advance">
          <label className="check">
            <input
              type="radio"
              name="advance"
              aria-label="Tap once per round"
              checked={w.advance !== 'step'}
              onChange={() => update({ advance: 'round' })}
            />
            Tap once per round
          </label>
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
        </fieldset>
      )}
    </div>
  );
}

export function Editor({ id, navigate }: { id: string; navigate: Navigate }) {
  const lib = useLibrary();
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
  const locked = w.mode === 'tabata';

  /** Keeps custom per-round times in step with the number of rounds. */
  const changeRounds = (rounds: number | null) => {
    const patch: Partial<Workout> = { rounds };
    if (w.roundTimes) {
      if (rounds === null) patch.roundTimes = undefined;
      else if (rounds >= 1) patch.roundTimes = resizeRoundTimes(w.roundTimes, rounds);
    }
    update(patch);
  };

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
          <Icon name="back" />
          <span className="sr-only">Back to library</span>
        </button>
        <span className="badge">{MODE_LABELS[w.mode]}</span>
        <button className="btn primary" disabled={errors.length > 0} onClick={() => leave({ name: 'run', id: w.id })}>
          Start
        </button>
      </header>

      {locked && (
        <div className="notice">
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
          <NumberField
            min={1}
            aria-label="Rounds"
            disabled={w.rounds === null || locked}
            value={w.rounds ?? undefined}
            onChange={(rounds) => changeRounds(rounds ?? 0)}
          />
          <label className="check">
            <input
              type="checkbox"
              aria-label="Until I stop"
              disabled={locked}
              checked={w.rounds === null}
              onChange={(e) => changeRounds(e.target.checked ? null : 3)}
            />
            Until I stop
          </label>
        </div>
      </div>

      <button
        className="advanced-toggle"
        aria-expanded={advancedOpen}
        aria-controls="advanced-panel"
        onClick={() => setAdvancedOpen(!advancedOpen)}
      >
        Advanced
        <Icon name="chevron" size={18} />
      </button>
      {advancedOpen && <AdvancedOptions w={w} update={update} locked={locked} />}

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
                advanced={advancedOpen}
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
