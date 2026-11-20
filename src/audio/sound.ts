import type { Cue } from './cues';

export interface Sound {
  unlock(): Promise<void>;
  play(cue: Cue): void;
  setVolume(v: number): void;
  setEnabled(on: boolean): void;
  setVibrate(on: boolean): void;
  /** False only when an audio context exists, sound is on, and the browser has suspended or interrupted it. */
  running(): boolean;
}

interface Tone {
  freq: number;
  at: number;
  dur: number;
  endFreq?: number;
  type?: OscillatorType;
}

const TONES: Record<Cue, Tone[]> = {
  beep: [{ freq: 880, at: 0, dur: 0.12 }],
  work: [{ freq: 660, at: 0, dur: 0.5, endFreq: 1320, type: 'triangle' }],
  rest: [
    { freq: 520, at: 0, dur: 0.16 },
    { freq: 390, at: 0.2, dur: 0.28 },
  ],
  finish: [
    { freq: 784, at: 0, dur: 0.18 },
    { freq: 988, at: 0.22, dur: 0.18 },
    { freq: 1319, at: 0.44, dur: 0.5 },
  ],
};

const VIBRATION: Record<Cue, number | number[]> = {
  beep: 40,
  work: 150,
  rest: [60, 40, 60],
  finish: [200, 100, 200, 100, 300],
};

function defaultCtxFactory(): AudioContext {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio is not supported');
  return new Ctor();
}

export function createSound(opts: { ctxFactory?: () => AudioContext } = {}): Sound {
  const factory = opts.ctxFactory ?? defaultCtxFactory;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let volume = 0.8;
  let enabled = true;
  let vibrate = true;

  function playTone(c: AudioContext, out: GainNode, t: Tone) {
    const start = c.currentTime + t.at;
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = t.type ?? 'sine';
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.endFreq) osc.frequency.exponentialRampToValueAtTime(t.endFreq, start + t.dur);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(0.9, start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
    osc.connect(env);
    env.connect(out);
    osc.start(start);
    osc.stop(start + t.dur + 0.05);
  }

  return {
    async unlock() {
      try {
        // iOS: play through the ring/silent switch instead of being muted by it.
        const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
        if (session) session.type = 'playback';
      } catch {
        /* not supported */
      }
      if (!ctx) {
        try {
          ctx = factory();
          master = ctx.createGain();
          master.gain.value = volume;
          master.connect(ctx.destination);
        } catch {
          ctx = null;
          master = null;
          return;
        }
      }
      if (ctx.state !== 'running') {
        try {
          await ctx.resume();
        } catch {
          /* outside a tap the browser may refuse; the next tap tries again */
        }
      }
    },
    play(cue) {
      if (!enabled) return;
      if (ctx && master) {
        if (ctx.state !== 'running') void ctx.resume().catch(() => {});
        for (const t of TONES[cue]) playTone(ctx, master, t);
      }
      if (vibrate && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(VIBRATION[cue]);
      }
    },
    setVolume(v) {
      volume = Math.min(1, Math.max(0, v));
      if (master) master.gain.value = volume;
    },
    setEnabled(on) {
      enabled = on;
    },
    setVibrate(on) {
      vibrate = on;
    },
    running() {
      return !enabled || !ctx || ctx.state === 'running';
    },
  };
}
