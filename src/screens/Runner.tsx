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
  summarize,
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
import { MIN_LOGGED_SECONDS, addSession, sessionFromRun, setNote } from '../store/history';
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
  const [note, setNoteText] = useState('');
  // rounds picked on the start screen for this run only ('saved' = use the workout's own setting)
  const [roundsChoice, setRoundsChoice] = useState<number | null | 'saved'>('saved');
  const [waitChoice, setWaitChoice] = useState<boolean | 'saved'>('saved');

  useEffect(() => {
    sound.setVolume(settings.volume);
    sound.setEnabled(settings.sound);
    sound.setVibrate(settings.vibrate);
  }, [sound, settings]);

  function apply(next: RunState, events: RunEvent[] = []) {
    const wasFinished = runRef.current?.finished ?? false;
    runRef.current = next;
    setRun(next);
    if (next.finished) {
      clearActiveRun();
      if (!wasFinished) addSession(sessionFromRun(next, Date.now()));
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
              <input
                type="number"
                inputMode="numeric"
                min={1}
                aria-label="Rounds"
                disabled={chosenRounds === null}
                value={chosenRounds ?? ''}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setRoundsChoice(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
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
          <button className="btn primary huge" onClick={() => act(done)}>
            +1 round
          </button>
        )}
        {seg.seconds === null && !seg.counter && (
          <button className="btn primary huge" onClick={() => act(done)}>
            {seg.gate ? `Start round ${seg.round}` : 'Done'}
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
