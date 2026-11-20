import { useEffect, useRef, useState } from 'react';
import { cueFor } from '../audio/cues';
import { Icon } from '../components/Icon';
import { NumberField } from '../components/NumberField';
import { WeightFields } from '../components/WeightFields';
import { createSound, type Sound } from '../audio/sound';
import {
  adjustSeconds,
  back,
  currentSegment,
  done,
  pause,
  remainingMs,
  resume,
  skip,
  startRun,
  summarize,
  undoLap,
  update,
  type RunEvent,
  type RunState,
} from '../engine/runner';
import { useLibrary } from '../hooks/useLibrary';
import { useWakeLock } from '../hooks/useWakeLock';
import { formatDuration, formatTime } from '../model/format';
import { segmentsForRound, validateWorkout } from '../model/segments';
import type { Segment } from '../model/types';
import type { Navigate } from '../route';
import { clearActiveRun, loadActiveRun, saveActiveRun } from '../store/activeRun';
import {
  MIN_LOGGED_SECONDS,
  addSession,
  loadHistory,
  sessionFromRun,
  setNote,
  setWeights,
  trackedExercises,
} from '../store/history';
import { lastWeights } from '../store/stats';
import { loadSettings } from '../store/settings';

function nextSegment(run: RunState): Segment | undefined {
  const inList = run.segments[run.index + 1];
  if (inList) return inList;
  const w = run.workout;
  if (w.rounds !== null && run.round >= w.rounds) return undefined;
  return segmentsForRound(w, run.round + 1)[0];
}

function nextText(seg: Segment): string {
  return seg.items && seg.itemIndex === undefined ? `Round ${seg.round}` : seg.label;
}

function itemText(i: { label: string; reps?: number }): string {
  return i.reps ? `${i.reps} ${i.label}` : i.label;
}

export function Runner({
  id,
  navigate,
  sound: injected,
  resume: resumeSaved = false,
}: {
  id: string;
  navigate: Navigate;
  sound?: Sound;
  /** Pick up the saved, interrupted run instead of showing the start screen. */
  resume?: boolean;
}) {
  const lib = useLibrary();
  const [sound] = useState<Sound>(() => injected ?? createSound());
  const [settings] = useState(() => loadSettings());

  const [run, setRun] = useState<RunState | null>(() => {
    if (!resumeSaved) return null;
    const saved = loadActiveRun();
    return saved && saved.workout.id === id ? update(saved, Date.now()).state : null;
  });
  const runRef = useRef<RunState | null>(run);
  const lastTap = useRef(0);
  /** Ignore a control tap that follows another within 400 ms: sweaty-hand double taps. */
  const allowTap = () => {
    const t = Date.now();
    if (t - lastTap.current < 400) return false;
    lastTap.current = t;
    return true;
  };
  const [needsTap, setNeedsTap] = useState(run !== null);
  const [, setFrame] = useState(0);
  const [startError, setStartError] = useState<string | null>(null);
  const [note, setNoteText] = useState('');
  const [weightValues, setWeightValues] = useState<Record<string, number | undefined>>({});
  // rounds picked on the start screen for this run only ('saved' = use the workout's own setting)
  const [roundsChoice, setRoundsChoice] = useState<number | null | 'saved'>('saved');
  const [waitChoice, setWaitChoice] = useState<boolean | 'saved'>('saved');

  useEffect(() => () => void sound.close(), [sound]);

  useEffect(() => {
    sound.setVolume(settings.volume);
    sound.setEnabled(settings.sound);
    sound.setVibrate(settings.vibrate);
  }, [sound, settings]);

  /** Start the weights from what you lifted last time (same unit), and save that with the session. */
  function startWeights(finished: RunState, sessionId: string) {
    const tracked = trackedExercises(finished.workout);
    if (tracked.length === 0) return;
    const last = lastWeights(loadHistory());
    const values: Record<string, number | undefined> = {};
    for (const ex of tracked) {
      const w = last.get(ex.toLowerCase());
      if (w && w.unit === settings.weightUnit) values[ex] = w.value;
    }
    setWeightValues(values);
    setWeights(
      sessionId,
      tracked.filter((ex) => values[ex] !== undefined).map((ex) => ({ exercise: ex, value: values[ex]! })),
      settings.weightUnit,
    );
  }

  function apply(next: RunState, events: RunEvent[] = []) {
    const wasFinished = runRef.current?.finished ?? false;
    runRef.current = next;
    setRun(next);
    if (next.finished) {
      clearActiveRun();
      if (!wasFinished) {
        const session = sessionFromRun(next, Date.now());
        addSession(session);
        startWeights(next, session.id);
      }
    } else {
      saveActiveRun(next);
    }
    for (const e of events) {
      const cue = cueFor(e);
      if (cue) sound.play(cue);
    }
  }

  const live = run !== null && !run.finished;

  useEffect(() => {
    if (!live) return;
    const tick = () => {
      const cur = runRef.current;
      if (!cur || cur.finished) return;
      const out = update(cur, Date.now());
      if (out.state !== cur) apply(out.state, out.events);
      else setFrame((n) => n + 1);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sound.unlock();
      tick();
    };
    const timer = setInterval(tick, 250);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // apply only uses refs and stable setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  useWakeLock(live && settings.keepAwake);

  const workout = run?.workout ?? lib.workouts.find((w) => w.id === id);
  if (!workout) {
    return (
      <section className="screen">
        <p>Workout not found</p>
        <button className="btn" onClick={() => navigate({ name: 'library' })}>
          Back to library
        </button>
      </section>
    );
  }

  const act = (fn: (r: RunState, now: number) => { state: RunState; events: RunEvent[] } | RunState) => {
    void sound.unlock(); // every tap re-arms audio that iOS may have interrupted
    const cur = runRef.current;
    if (!cur) return;
    const out = fn(cur, Date.now());
    if ('state' in out) apply(out.state, out.events);
    else apply(out);
  };

  const chosenRounds = roundsChoice === 'saved' ? workout.rounds : roundsChoice;
  const chosenWait = waitChoice === 'saved' ? !!workout.waitBetweenRounds : waitChoice;
  const canChooseRounds = workout.mode !== 'amrap' && workout.mode !== 'tabata';

  function begin() {
    void sound.unlock();
    try {
      const st = startRun({ ...workout!, rounds: chosenRounds, waitBetweenRounds: chosenWait }, Date.now(), settings.beepSeconds);
      setNeedsTap(false);
      apply(st, [{ type: 'segment-start', segment: currentSegment(st) }]);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Could not start this workout.');
    }
  }

  function onSkip() {
    if (!allowTap()) return;
    const cur = runRef.current;
    if (!cur) return;
    // skipping the last step ends the workout: make sure that is what was meant
    if (skip(cur, Date.now()).state.finished && !window.confirm('Finish the workout now?')) return;
    act(skip);
  }

  function quit() {
    if (window.confirm('End this workout? Your progress so far is saved to your history.')) {
      const cur = runRef.current;
      if (cur && !cur.finished) {
        const session = sessionFromRun(cur, Date.now(), false);
        if (session.durationSec >= MIN_LOGGED_SECONDS) addSession(session);
      }
      clearActiveRun();
      navigate({ name: 'library' });
    }
  }

  // ---- start screen ----
  if (!run) {
    const errors = validateWorkout({ ...workout, rounds: chosenRounds });
    return (
      <section className="screen run-start">
        <h1>{workout.name.trim() || 'Untitled'}</h1>
        <p className="muted">
          {workout.steps.length} steps · get ready {formatTime(workout.prepSeconds)}
        </p>
        {canChooseRounds && (
          <div className="start-options">
            <span className="field-label">Rounds</span>
            <div className="rounds-field">
              <NumberField
                min={1}
                aria-label="Rounds"
                disabled={chosenRounds === null}
                value={chosenRounds ?? undefined}
                onChange={(n) => setRoundsChoice(n ?? 0)}
              />
              <label className="check">
                <input
                  type="checkbox"
                  aria-label="Unlimited"
                  checked={chosenRounds === null}
                  onChange={(e) => setRoundsChoice(e.target.checked ? null : (workout.rounds ?? 3))}
                />
                Unlimited
              </label>
            </div>
          </div>
        )}
        {canChooseRounds && chosenRounds !== 1 && (
          <label className="check">
            <input
              type="checkbox"
              aria-label="Wait for a tap between rounds"
              checked={chosenWait}
              onChange={(e) => setWaitChoice(e.target.checked)}
            />
            Wait for a tap between rounds
          </label>
        )}
        {(errors.length > 0 || startError) && (
          <ul className="errors">
            {[...errors, ...(startError ? [startError] : [])].map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <button className="btn primary huge" disabled={errors.length > 0} onClick={begin}>
          Start
        </button>
        <button className="btn ghost wide" onClick={() => navigate({ name: 'library' })}>
          Back to library
        </button>
      </section>
    );
  }

  // ---- finished ----
  if (run.finished) {
    const sum = summarize(run, Date.now());
    const sessionId = `${run.workout.id}-${run.startedAt}`;
    const tracked = trackedExercises(run.workout);
    const saveWeights = (values: Record<string, number | undefined>) => {
      setWeightValues(values);
      setWeights(
        sessionId,
        tracked.filter((ex) => values[ex] !== undefined).map((ex) => ({ exercise: ex, value: values[ex]! })),
        settings.weightUnit,
      );
    };
    return (
      <section className="screen run-done">
        <h1>Workout complete</h1>
        <p className="muted">{workout.name.trim() || 'Untitled'}</p>
        <div className="summary" data-testid="summary">
          <div className="stats">
            <div className="stat">
              <div className="stat-value">{formatDuration(sum.durationSec)}</div>
              <div className="stat-label">Time</div>
            </div>
            {sum.laps > 0 ? (
              <div className="stat">
                <div className="stat-value">{sum.laps}</div>
                <div className="stat-label">Rounds</div>
              </div>
            ) : (
              sum.roundsDone > 0 && (
                <div className="stat">
                  <div className="stat-value">{sum.roundsDone}</div>
                  <div className="stat-label">{sum.roundsDone === 1 ? 'Round' : 'Rounds'}</div>
                </div>
              )
            )}
          </div>
          <p className="muted">Saved to history ✓</p>
          {tracked.length > 0 && (
            <div className="weights">
              <h2>Weights</h2>
              <WeightFields
                exercises={tracked}
                values={weightValues}
                unit={settings.weightUnit}
                onChange={(ex, v) => saveWeights({ ...weightValues, [ex]: v })}
                onFillAll={(v) => saveWeights(Object.fromEntries(tracked.map((ex) => [ex, v])))}
              />
            </div>
          )}
          <textarea
            className="note"
            aria-label="Note"
            placeholder="Add a note (weights, how it felt…)"
            rows={2}
            value={note}
            onChange={(e) => {
              setNoteText(e.target.value);
              setNote(sessionId, e.target.value);
            }}
          />
        </div>
        <button className="btn primary huge" onClick={() => navigate({ name: 'library' })}>
          Back to library
        </button>
      </section>
    );
  }

  // ---- running ----
  const seg = currentSegment(run);
  const now = Date.now();
  const ms = remainingMs(run, now);
  const next = nextSegment(run);
  const paused = run.pausedAt !== null;
  const roundLabel =
    seg.counter || seg.round === 0 || workout.rounds === 1
      ? null
      : workout.rounds === null
        ? `Round ${seg.round}`
        : `Round ${seg.round} of ${workout.rounds}`;

  return (
    <section className={`screen run run-${seg.role}`}>
      <header className="run-head">
        <button className="btn ghost" onClick={quit}>
          <Icon name="close" />
          <span className="sr-only">Quit</span>
        </button>
        <div className="run-title">
          <div>{workout.name.trim() || 'Untitled'}</div>
          {roundLabel && <div className="muted">{roundLabel}</div>}
          {seg.counter && <div className="muted">Rounds: {run.laps}</div>}
        </div>
        <span className="run-spacer" />
      </header>

      {(needsTap || (settings.sound && !sound.running())) && (
        <button
          className="btn primary huge resume-overlay"
          onClick={() => {
            void sound.unlock();
            setNeedsTap(false);
          }}
        >
          Tap to resume
        </button>
      )}

      <div className="run-main">
        {seg.role === 'prep' ? (
          <div className="run-label">Get ready</div>
        ) : (
          (seg.seconds !== null || seg.gate) && <div className="run-label">{seg.label}</div>
        )}
        {seg.gate && <div className="muted">Ready when you are</div>}
        {ms !== null && (
          <div className="clock num" data-testid="clock">
            {formatTime(Math.ceil(ms / 1000))}
          </div>
        )}
        {paused && <div className="muted">Paused</div>}

        {seg.items && (
          <ol className="items">
            {seg.items.map((it, i) => (
              <li
                key={i}
                aria-current={seg.itemIndex === i ? 'step' : undefined}
                className={seg.itemIndex !== undefined && i < seg.itemIndex ? 'item done' : 'item'}
              >
                {itemText(it)}
              </li>
            ))}
          </ol>
        )}

        {seg.counter && (
          <div className="lap-controls">
            <button className="btn primary huge" onClick={() => allowTap() && act(done)}>
              +1 round
            </button>
            {run.laps > 0 && (
              <button className="btn" onClick={() => allowTap() && act((r) => undoLap(r))}>
                Undo round
              </button>
            )}
          </div>
        )}
        {seg.seconds === null && !seg.counter && (
          <button className="btn primary huge" onClick={() => allowTap() && act(done)}>
            {seg.gate ? `Start round ${seg.round}` : 'Done'}
          </button>
        )}
        {seg.role === 'rest' && seg.seconds !== null && (
          <div className="adjust">
            <button className="btn" aria-label="Remove 15 seconds" onClick={() => allowTap() && act((r, n) => adjustSeconds(r, -15, n))}>
              −15s
            </button>
            <button className="btn" aria-label="Add 15 seconds" onClick={() => allowTap() && act((r, n) => adjustSeconds(r, 15, n))}>
              +15s
            </button>
          </div>
        )}
      </div>

      {next && <div className="run-next muted">Next: {nextText(next)}</div>}

      <footer className="run-controls">
        <button className="btn" aria-label="Previous" onClick={() => allowTap() && act((r, n) => back(r, n))}>
          <Icon name="prev" />
        </button>
        <button className="btn primary" onClick={() => act((r, n) => (paused ? resume(r, n) : pause(r, n)))}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button className="btn" aria-label="Skip" onClick={onSkip}>
          <Icon name="next" />
        </button>
      </footer>
    </section>
  );
}
