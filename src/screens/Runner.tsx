import { useEffect, useRef, useState } from 'react';
import { cueFor } from '../audio/cues';
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
  update,
  type RunEvent,
  type RunState,
} from '../engine/runner';
import { useLibrary } from '../hooks/useLibrary';
import { useWakeLock } from '../hooks/useWakeLock';
import { formatTime } from '../model/format';
import { segmentsForRound, validateWorkout } from '../model/segments';
import type { Segment } from '../model/types';
import type { Navigate } from '../route';
import { clearActiveRun, loadActiveRun, saveActiveRun } from '../store/activeRun';
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

export function Runner({ id, navigate, sound: injected }: { id: string; navigate: Navigate; sound?: Sound }) {
  const lib = useLibrary();
  const [sound] = useState<Sound>(() => injected ?? createSound());
  const [settings] = useState(() => loadSettings());

  const [run, setRun] = useState<RunState | null>(() => {
    const saved = loadActiveRun();
    return saved && saved.workout.id === id ? update(saved, Date.now()).state : null;
  });
  const runRef = useRef<RunState | null>(run);
  const [needsTap, setNeedsTap] = useState(run !== null);
  const [, setFrame] = useState(0);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    sound.setVolume(settings.volume);
    sound.setEnabled(settings.sound);
    sound.setVibrate(settings.vibrate);
  }, [sound, settings]);

  function apply(next: RunState, events: RunEvent[] = []) {
    runRef.current = next;
    setRun(next);
    if (next.finished) clearActiveRun();
    else saveActiveRun(next);
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
    const timer = setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
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
    const cur = runRef.current;
    if (!cur) return;
    const out = fn(cur, Date.now());
    if ('state' in out) apply(out.state, out.events);
    else apply(out);
  };

  function begin() {
    void sound.unlock();
    try {
      const st = startRun(workout!, Date.now(), settings.beepSeconds);
      setNeedsTap(false);
      apply(st, [{ type: 'segment-start', segment: currentSegment(st) }]);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Could not start this workout.');
    }
  }

  function quit() {
    if (window.confirm('Quit this workout?')) {
      clearActiveRun();
      navigate({ name: 'library' });
    }
  }

  // ---- start screen ----
  if (!run) {
    const errors = validateWorkout(workout);
    return (
      <section className="screen run-start">
        <h1>{workout.name.trim() || 'Untitled'}</h1>
        <p className="muted">
          {workout.steps.length} steps · get ready {formatTime(workout.prepSeconds)}
        </p>
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
    return (
      <section className="screen run-done">
        <h1>Workout complete</h1>
        <p className="muted">{workout.name.trim() || 'Untitled'}</p>
        {run.laps > 0 && <p className="big">Rounds: {run.laps}</p>}
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
    seg.counter || seg.round === 0
      ? null
      : workout.rounds === null
        ? `Round ${seg.round}`
        : `Round ${seg.round} of ${workout.rounds}`;

  return (
    <section className={`screen run run-${seg.role}`}>
      <header className="run-head">
        <button className="btn ghost" onClick={quit}>
          <span aria-hidden>✕</span>
          <span className="sr-only">Quit</span>
        </button>
        <div className="run-title">
          <div>{workout.name.trim() || 'Untitled'}</div>
          {roundLabel && <div className="muted">{roundLabel}</div>}
          {seg.counter && <div className="muted">Rounds: {run.laps}</div>}
        </div>
        <span className="run-spacer" />
      </header>

      {needsTap && (
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
        {seg.role === 'prep' ? <div className="run-label">Get ready</div> : seg.seconds !== null && <div className="run-label">{seg.label}</div>}
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
          <button className="btn primary huge" onClick={() => act(done)}>
            +1 round
          </button>
        )}
        {seg.seconds === null && !seg.counter && (
          <button className="btn primary huge" onClick={() => act(done)}>
            Done
          </button>
        )}
        {seg.role === 'rest' && seg.seconds !== null && (
          <div className="adjust">
            <button className="btn" aria-label="Remove 15 seconds" onClick={() => act((r, n) => adjustSeconds(r, -15, n))}>
              −15s
            </button>
            <button className="btn" aria-label="Add 15 seconds" onClick={() => act((r, n) => adjustSeconds(r, 15, n))}>
              +15s
            </button>
          </div>
        )}
      </div>

      {next && <div className="run-next muted">Next: {nextText(next)}</div>}

      <footer className="run-controls">
        <button className="btn" aria-label="Previous" onClick={() => act((r, n) => back(r, n))}>
          ⏮
        </button>
        <button className="btn primary" onClick={() => act((r, n) => (paused ? resume(r, n) : pause(r, n)))}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button className="btn" aria-label="Skip" onClick={() => act(skip)}>
          ⏭
        </button>
      </footer>
    </section>
  );
}
