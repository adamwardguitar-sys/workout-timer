import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Mock } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Runner } from './Runner';
import { useWakeLock } from '../hooks/useWakeLock';
import { startRun } from '../engine/runner';
import { templateFor } from '../model/templates';
import type { Step, Workout } from '../model/types';
import type { Sound } from '../audio/sound';
import { loadActiveRun, saveActiveRun } from '../store/activeRun';
import { MIGRATIONS_KEY, loadLibrary, saveLibrary } from '../store/library';
import { addSession, loadHistory } from '../store/history';
import { DEFAULT_SETTINGS, saveSettings } from '../store/settings';

vi.mock('../hooks/useWakeLock', () => ({ useWakeLock: vi.fn() }));

const timed = (label: string, seconds: number, role: Step['role'] = 'work'): Step => ({
  id: `${label}-${seconds}`,
  label,
  kind: 'timed',
  role,
  seconds,
});
const tapStep = (label: string, reps?: number): Step => ({ id: label, label, kind: 'tap', role: 'work', reps });

const interval: Workout = {
  id: 'interval',
  name: 'Intervals',
  mode: 'custom',
  prepSeconds: 10,
  steps: [timed('Squats', 40), timed('Rest', 20, 'rest')],
  rounds: 2,
  advance: 'step',
  restBetweenRounds: 0,
};
const noPrep: Workout = { ...interval, id: 'noprep', prepSeconds: 0 };
const flow: Workout = {
  id: 'flow',
  name: 'Flow',
  mode: 'flow',
  prepSeconds: 0,
  steps: [tapStep('Rows', 5), tapStep('Squats', 5)],
  rounds: null,
  advance: 'round',
  restBetweenRounds: 120,
};
const list3: Workout = {
  ...interval,
  id: 'list3',
  name: 'List',
  prepSeconds: 0,
  steps: [timed('A', 40), timed('B', 40), timed('C', 40)],
  rounds: 1,
  restBetweenSteps: 20,
};
const flowStep: Workout = { ...flow, id: 'flowstep', advance: 'step', steps: [tapStep('A'), tapStep('B'), tapStep('C')] };
const gated: Workout = { ...noPrep, id: 'gated', steps: [timed('Squats', 40)], rounds: 2, waitBetweenRounds: true };
const quick: Workout = { ...interval, id: 'quick', prepSeconds: 0, steps: [timed('Go', 5)], rounds: 1 };
const amrap: Workout = { ...templateFor('amrap'), id: 'amrap', prepSeconds: 0 };

function fakeSound(): Sound {
  return {
    unlock: vi.fn(async () => {}),
    play: vi.fn(),
    setVolume: vi.fn(),
    setEnabled: vi.fn(),
    setVibrate: vi.fn(),
    running: vi.fn(() => true),
    close: vi.fn(async () => {}),
  };
}

const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

function setup(w: Workout, opts: { skipStart?: boolean } = {}) {
  saveLibrary([interval, noPrep, flow, flowStep, gated, quick, amrap, list3]);
  const navigate = vi.fn();
  const sound = fakeSound();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<Runner id={w.id} navigate={navigate} sound={sound} />);
  const start = async () => {
    await user.click(screen.getByRole('button', { name: 'Start' }));
  };
  return { navigate, sound, user, start, opts };
}

const clock = () => screen.getByTestId('clock');
const cues = (sound: Sound) => (sound.play as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);

beforeEach(() => {
  localStorage.clear();
  // these fixtures deliberately use a 10s get-ready, so mark the 30s default migration as already done
  localStorage.setItem(MIGRATIONS_KEY, JSON.stringify(['prep-30']));
  vi.useFakeTimers();
  // Testing Library only drains timers under fake timers when it sees a `jest` global.
  (globalThis as unknown as { jest: unknown }).jest = {
    advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
  };
  vi.mocked(useWakeLock).mockClear();
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { jest?: unknown }).jest;
});

describe('Runner basics', () => {
  it('waits on a Start screen, then unlocks sound and counts down the get-ready', async () => {
    const { sound, start } = setup(interval);
    expect(screen.getByRole('heading', { name: 'Intervals' })).toBeInTheDocument();
    expect(sound.unlock).not.toHaveBeenCalled();
    await start();
    expect(sound.unlock).toHaveBeenCalled();
    expect(screen.getByText('Get ready')).toBeInTheDocument();
    expect(clock()).toHaveTextContent('0:10');
  });

  it('moves into work with the label, round counter and a next line', async () => {
    const { start } = setup(interval);
    await start();
    tick(10_000);
    expect(screen.getByText('Squats')).toBeInTheDocument();
    expect(clock()).toHaveTextContent('0:40');
    expect(screen.getByText('Round 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Next: Rest')).toBeInTheDocument();
  });

  it('does not show a round counter for a single-round workout', async () => {
    const { start } = setup(quick);
    await start();
    expect(screen.queryByText(/^Round/)).not.toBeInTheDocument();
  });

  it('plays the cues from the engine events', async () => {
    const { sound, start } = setup(interval);
    await start();
    tick(10_000);
    expect(cues(sound).filter((c) => c === 'beep')).toHaveLength(3);
    expect(cues(sound)).toContain('work');
    tick(40_000);
    expect(cues(sound)).toContain('rest');
    tick(60_000);
    expect(cues(sound).at(-1)).toBe('finish');
    expect(screen.getByRole('heading', { name: 'Workout complete' })).toBeInTheDocument();
  });

  it('plays the work cue at once when there is no get-ready', async () => {
    const { sound, start } = setup(noPrep);
    await start();
    expect(cues(sound)).toEqual(['work']);
  });

  it('uses the saved beep seconds and sound settings', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, beepSeconds: 2, volume: 0.3, sound: false, vibrate: false });
    const { sound, start } = setup(interval);
    expect(sound.setVolume).toHaveBeenCalledWith(0.3);
    expect(sound.setEnabled).toHaveBeenCalledWith(false);
    expect(sound.setVibrate).toHaveBeenCalledWith(false);
    await start();
    tick(10_000);
    expect(cues(sound).filter((c) => c === 'beep')).toHaveLength(2);
  });

  it('shows not found for an unknown workout', () => {
    saveLibrary([]);
    render(<Runner id="nope" navigate={vi.fn()} sound={fakeSound()} />);
    expect(screen.getByText('Workout not found')).toBeInTheDocument();
  });

  it('keeps the screen awake only while running', async () => {
    const { start } = setup(interval);
    expect(useWakeLock).toHaveBeenLastCalledWith(false);
    await start();
    expect(useWakeLock).toHaveBeenLastCalledWith(true);
  });

  it('does not request a wake lock when keep-awake is off', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, keepAwake: false });
    const { start } = setup(interval);
    await start();
    expect(useWakeLock).toHaveBeenLastCalledWith(false);
  });
});

describe('Runner tap and rest', () => {
  it('flow: lists the exercises with reps, Done goes to rest, rest can be adjusted, then the next round', async () => {
    const { sound, user, start } = setup(flow);
    await start();
    expect(screen.getByText('5 Rows')).toBeInTheDocument();
    expect(screen.getByText('5 Squats')).toBeInTheDocument();
    expect(screen.getByText('Round 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Round done' }));
    expect(cues(sound)).toContain('rest');
    expect(screen.getByText('Rest')).toBeInTheDocument();
    expect(clock()).toHaveTextContent('2:00');
    tick(500);
    await user.click(screen.getByRole('button', { name: 'Add 15 seconds' }));
    expect(clock()).toHaveTextContent('2:15');
    tick(500);
    await user.click(screen.getByRole('button', { name: 'Remove 15 seconds' }));
    tick(500);
    await user.click(screen.getByRole('button', { name: 'Remove 15 seconds' }));
    expect(clock()).toHaveTextContent('1:44'); // 1:45 less the 1.5 s of waiting between taps
    tick(104_000);
    expect(screen.getByText('Round 2')).toBeInTheDocument();
    expect(screen.getByText('5 Rows')).toBeInTheDocument();
  });

});

describe('Runner pause, finish and AMRAP', () => {
  it('pausing freezes the clock until Resume', async () => {
    const { user, start } = setup(noPrep);
    await start();
    tick(5_000);
    expect(clock()).toHaveTextContent('0:35');
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    tick(30_000);
    expect(clock()).toHaveTextContent('0:35');
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    tick(5_000);
    expect(clock()).toHaveTextContent('0:30');
  });

  it('finishing shows the complete screen, clears the saved run and can go back', async () => {
    const { navigate, user, start } = setup(quick);
    await start();
    expect(loadActiveRun()?.workout.id).toBe('quick');
    tick(5_000);
    expect(screen.getByRole('heading', { name: 'Workout complete' })).toBeInTheDocument();
    expect(loadActiveRun()).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back to library' }));
    expect(navigate).toHaveBeenCalledWith({ name: 'library' });
  });

  it('AMRAP counts rounds and reports them at the end', async () => {
    const { user, start } = setup(amrap);
    await start();
    await user.click(screen.getByRole('button', { name: '+1 round' }));
    tick(500);
    await user.click(screen.getByRole('button', { name: '+1 round' }));
    expect(screen.getByText('Rounds: 2')).toBeInTheDocument();
    tick(600_000);
    expect(screen.getByRole('heading', { name: 'Workout complete' })).toBeInTheDocument();
    expect(screen.getByTestId('summary')).toHaveTextContent(/2\s*Rounds/);
  });
});

describe('Runner resume and quit', () => {
  it('reopens a saved run with the clock moved on, and a tap unlocks the sound', async () => {
    saveActiveRun(startRun(interval, Date.now()));
    vi.setSystemTime(Date.now() + 15_000);
    saveLibrary([interval]);
    const sound = fakeSound();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Runner id="interval" resume navigate={vi.fn()} sound={sound} />);
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.getByText('Squats')).toBeInTheDocument();
    expect(clock()).toHaveTextContent('0:35');
    expect(sound.unlock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Tap to resume' }));
    expect(sound.unlock).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Tap to resume' })).not.toBeInTheDocument();
  });

  it('Quit asks for confirmation, clears the saved run and returns to the library', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { navigate, user, start } = setup(interval);
    await start();
    await user.click(screen.getByRole('button', { name: 'Quit' }));
    expect(confirm).toHaveBeenCalled();
    expect(loadActiveRun()).toBeNull();
    expect(navigate).toHaveBeenCalledWith({ name: 'library' });
  });

  it('cancelling Quit keeps the workout running', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { navigate, user, start } = setup(interval);
    await start();
    await user.click(screen.getByRole('button', { name: 'Quit' }));
    expect(navigate).not.toHaveBeenCalled();
    expect(loadActiveRun()).not.toBeNull();
  });

  it('does not resume a saved run that finished while the app was closed', async () => {
    saveLibrary([quick]);
    saveActiveRun(startRun(quick, Date.now()));
    vi.setSystemTime(Date.now() + 60_000);
    render(<Runner id="quick" navigate={vi.fn()} sound={fakeSound()} />);
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Workout complete' })).not.toBeInTheDocument();
    expect(loadActiveRun()).toBeNull();
  });
});

describe('Runner audio recovery', () => {
  it('every tap re-arms the audio', async () => {
    const { sound, user, start } = setup(noPrep);
    await start();
    const before = (sound.unlock as Mock).mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect((sound.unlock as Mock).mock.calls.length).toBeGreaterThan(before);
  });

  it('asks for a tap when the audio was interrupted, and a tap brings it back', async () => {
    let up = true;
    const { sound, user, start } = setup(noPrep);
    (sound.running as Mock).mockImplementation(() => up);
    (sound.unlock as Mock).mockImplementation(async () => {
      up = true;
    });
    await start();
    expect(screen.queryByRole('button', { name: 'Tap to resume' })).not.toBeInTheDocument();
    up = false;
    tick(500);
    await user.click(screen.getByRole('button', { name: 'Tap to resume' }));
    tick(300);
    expect(screen.queryByRole('button', { name: 'Tap to resume' })).not.toBeInTheDocument();
  });

  it('does not nag about audio when sound is switched off', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, sound: false });
    const { sound, start } = setup(noPrep);
    (sound.running as Mock).mockReturnValue(false);
    await start();
    tick(500);
    expect(screen.queryByRole('button', { name: 'Tap to resume' })).not.toBeInTheDocument();
  });
});

describe('Runner start screen: rounds', () => {
  const rounds = () => screen.getByLabelText('Rounds') as HTMLInputElement;

  it('shows the workout rounds and lets you choose another number for this run only', async () => {
    const { user, start } = setup(noPrep);
    expect(rounds()).toHaveValue(2);
    fireEvent.change(rounds(), { target: { value: '1' } });
    await start();
    tick(40_000);
    expect(screen.getByRole('heading', { name: 'Workout complete' })).toBeInTheDocument();
    expect(loadLibrary().find((w) => w.id === 'noprep')?.rounds).toBe(2);
    expect(user).toBeDefined();
  });

  it('Unlimited keeps the workout going past any number of rounds', async () => {
    const { user, start } = setup(noPrep);
    await user.click(screen.getByLabelText('Unlimited'));
    expect(rounds()).toBeDisabled();
    await start();
    tick(600_000);
    expect(screen.queryByRole('heading', { name: 'Workout complete' })).not.toBeInTheDocument();
    expect(screen.getByText(/^Round \d+$/)).toBeInTheDocument();
  });

  it('starts from Unlimited when the workout is set to until-I-stop, and back to a number', async () => {
    const { user } = setup(flow);
    expect(screen.getByLabelText('Unlimited')).toBeChecked();
    await user.click(screen.getByLabelText('Unlimited'));
    expect(rounds()).toBeEnabled();
    expect(Number(rounds().value)).toBeGreaterThanOrEqual(1);
  });

  it('blocks Start for 0 rounds', () => {
    setup(noPrep);
    fireEvent.change(rounds(), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('is not offered for AMRAP or Tabata, where rounds are fixed by the mode', () => {
    setup(amrap);
    expect(screen.queryByLabelText('Rounds')).not.toBeInTheDocument();
  });
});

describe('Runner history', () => {
  it('logs a finished workout and shows a summary', async () => {
    const { start } = setup(quick);
    await start();
    tick(5_000);
    const [logged] = loadHistory();
    expect(loadHistory()).toHaveLength(1);
    expect(logged).toMatchObject({
      workoutId: 'quick',
      workoutName: 'Intervals',
      completed: true,
      durationSec: 5,
      roundsDone: 1,
    });
    expect(screen.getByTestId('summary')).toHaveTextContent('5s');
    expect(screen.getByTestId('summary')).toHaveTextContent('Saved to history');
  });

  it('lets you add a note to the session', async () => {
    const { user, start } = setup(quick);
    await start();
    tick(5_000);
    await user.type(screen.getByLabelText('Note'), 'felt strong');
    expect(loadHistory()[0].note).toBe('felt strong');
  });

  it('logs AMRAP laps', async () => {
    const { user, start } = setup(amrap);
    await start();
    await user.click(screen.getByRole('button', { name: '+1 round' }));
    tick(500);
    await user.click(screen.getByRole('button', { name: '+1 round' }));
    tick(600_000);
    expect(loadHistory()[0]).toMatchObject({ laps: 2, completed: true, mode: 'amrap' });
  });

  it('ending a workout early after a minute is logged as not completed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, start } = setup(noPrep);
    await start();
    tick(60_000);
    await user.click(screen.getByRole('button', { name: 'Quit' }));
    expect(loadHistory()).toHaveLength(1);
    expect(loadHistory()[0]).toMatchObject({ completed: false, durationSec: 60, roundsDone: 1 });
  });

  it('quitting within the first 30 seconds logs nothing', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, start } = setup(noPrep);
    await start();
    tick(10_000);
    await user.click(screen.getByRole('button', { name: 'Quit' }));
    expect(loadHistory()).toEqual([]);
  });

  it('cancelling Quit logs nothing', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user, start } = setup(noPrep);
    await start();
    tick(60_000);
    await user.click(screen.getByRole('button', { name: 'Quit' }));
    expect(loadHistory()).toEqual([]);
  });
});

describe('Runner protection against stray taps', () => {
  it('ignores a tap that lands right after Round done (the rest controls appear under the same finger)', async () => {
    const { user, start } = setup(flow);
    await start();
    await user.click(screen.getByRole('button', { name: 'Round done' }));
    await user.click(screen.getByRole('button', { name: 'Add 15 seconds' }));
    expect(clock()).toHaveTextContent('2:00');
    tick(500);
    await user.click(screen.getByRole('button', { name: 'Add 15 seconds' }));
    expect(clock()).toHaveTextContent('2:15');
  });

  it('ignores a quick second tap on +1 round, and Undo round takes one back', async () => {
    const { user, start } = setup(amrap);
    await start();
    await user.click(screen.getByRole('button', { name: '+1 round' }));
    await user.click(screen.getByRole('button', { name: '+1 round' }));
    expect(screen.getByText('Rounds: 1')).toBeInTheDocument();
    tick(500);
    await user.click(screen.getByRole('button', { name: '+1 round' }));
    expect(screen.getByText('Rounds: 2')).toBeInTheDocument();
    tick(500);
    await user.click(screen.getByRole('button', { name: 'Undo round' }));
    expect(screen.getByText('Rounds: 1')).toBeInTheDocument();
  });

});

describe('Runner resume versus start over', () => {
  it('opening a workout that has an older saved run starts fresh, and the old run only goes when you press Start', async () => {
    saveLibrary([interval]);
    saveActiveRun(startRun(interval, Date.now() - 5_000));
    const sound = fakeSound();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Runner id="interval" navigate={vi.fn()} sound={sound} />);
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    const oldStart = loadActiveRun()!.startedAt;
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(loadActiveRun()!.startedAt).toBeGreaterThan(oldStart);
    expect(screen.getByText('Get ready')).toBeInTheDocument();
    expect(clock()).toHaveTextContent('0:10');
  });

  it('releases the audio when you leave the screen', () => {
    const { sound } = setup(quick);
    cleanup();
    expect(sound.close).toHaveBeenCalled();
  });
});

describe('Runner weights', () => {
  const wt = (label: string, seconds: number, weighted = true): Step => ({ ...timed(label, seconds), id: `w-${label}`, weighted });
  const weighty: Workout = {
    ...quick,
    id: 'weighty',
    name: 'Weights day',
    steps: [wt('Goblet Squat', 5), wt('Chin Ups', 5, false), wt('Bicep Curls', 5)],
    rounds: 1,
  };

  const finishWeighty = async (opts: { sound?: boolean } = {}) => {
    saveLibrary([weighty, quick]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Runner id="weighty" navigate={vi.fn()} sound={fakeSound()} />);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    tick(15_000);
    return { user, opts };
  };

  it('asks for the weight of each tracked exercise only (N/A exercises are skipped)', async () => {
    await finishWeighty();
    expect(screen.getByLabelText('Weight for Goblet Squat')).toBeInTheDocument();
    expect(screen.getByLabelText('Weight for Bicep Curls')).toBeInTheDocument();
    expect(screen.queryByLabelText('Weight for Chin Ups')).not.toBeInTheDocument();
  });

  it('saves the weights you enter with the session, in the chosen unit', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, weightUnit: 'lb' });
    await finishWeighty();
    fireEvent.change(screen.getByLabelText('Weight for Goblet Squat'), { target: { value: '35' } });
    expect(loadHistory()[0].weights).toEqual([{ exercise: 'Goblet Squat', value: 35 }]);
    expect(loadHistory()[0].unit).toBe('lb');
    expect(screen.getAllByText('lb').length).toBeGreaterThan(0);
  });

  it('starts from what you lifted last time and saves it unless you change it', async () => {
    addSession({
      id: 'earlier',
      workoutId: 'other',
      workoutName: 'Other',
      mode: 'interval',
      startedAt: Date.now() - 86_400_000,
      durationSec: 600,
      roundsDone: 1,
      laps: 0,
      completed: true,
      weights: [
        { exercise: 'goblet squat', value: 12 },
        { exercise: 'Bicep Curls', value: 8 },
      ],
      unit: 'kg',
    });
    await finishWeighty();
    expect(screen.getByLabelText('Weight for Goblet Squat')).toHaveValue(12);
    expect(screen.getByLabelText('Weight for Bicep Curls')).toHaveValue(8);
    const mine = loadHistory().find((x) => x.workoutId === 'weighty')!;
    expect(mine.weights).toEqual([
      { exercise: 'Goblet Squat', value: 12 },
      { exercise: 'Bicep Curls', value: 8 },
    ]);
  });

  it('can copy one weight to every exercise', async () => {
    const { user } = await finishWeighty();
    fireEvent.change(screen.getByLabelText('Weight for Goblet Squat'), { target: { value: '16' } });
    await user.click(screen.getByRole('button', { name: 'Use 16 kg for all' }));
    expect(screen.getByLabelText('Weight for Bicep Curls')).toHaveValue(16);
    expect(loadHistory()[0].weights).toHaveLength(2);
  });

  it('shows no weight section when nothing is tracked', async () => {
    const { start } = setup(quick);
    await start();
    tick(5_000);
    expect(screen.queryByText('Weights')).not.toBeInTheDocument();
  });
});

describe('Runner icons', () => {
  it('uses an icon for quit, keeping its accessible name', async () => {
    const { start } = setup(noPrep);
    await start();
    expect(document.body.textContent).not.toMatch(/[✕⏮⏭]/u);
    expect(screen.getByRole('button', { name: 'Quit' }).querySelector('svg')).not.toBeNull();
  });
});

describe('Runner icon-only controls', () => {
  it('Pause, Resume and Skip show just an icon, with the words kept for screen readers', async () => {
    const { user, start } = setup(list3);
    await start();
    tick(1_000);
    const pause = screen.getByRole('button', { name: 'Pause' });
    const skipBtn = screen.getByRole('button', { name: 'Skip exercise' });
    for (const b of [pause, skipBtn]) {
      expect(b.querySelector('svg')).not.toBeNull();
      expect(b.textContent).toBe('');
    }
    await user.click(pause);
    const resume = screen.getByRole('button', { name: 'Resume' });
    expect(resume.querySelector('svg')).not.toBeNull();
    expect(resume.textContent).toBe('');
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });
});

describe('Runner Skip button', () => {
  const GONE = ['Previous exercise', 'Next exercise', 'Previous', 'Finish now'];
  const noBackOrFinish = () => {
    for (const name of GONE) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  };

  it('Timer: Pause and one Skip, and nothing that has to be tapped to continue', async () => {
    const { start } = setup(list3);
    await start();
    tick(1_000);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip exercise' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /done/i })).not.toBeInTheDocument();
    noBackOrFinish();
  });

  it('Timer: plays all the way through every round on its own, without touching Skip', async () => {
    const { start } = setup(noPrep); // 2 rounds of Squats 40 + Rest 20
    await start();
    tick(100_000);
    expect(screen.getByRole('heading', { name: 'Workout complete' })).toBeInTheDocument();
  });

  it('Skip get ready jumps past the get-ready to the first exercise', async () => {
    const { user, start } = setup(interval);
    await start();
    expect(screen.getByText('Get ready')).toBeInTheDocument();
    noBackOrFinish();
    await user.click(screen.getByRole('button', { name: 'Skip get ready' }));
    expect(screen.getByText('Squats')).toBeInTheDocument();
    expect(clock()).toHaveTextContent('0:40');
  });

  it('Skip exercise moves on to whatever comes next, and Skip rest to the next exercise', async () => {
    const { user, start } = setup(list3);
    await start();
    tick(500);
    await user.click(screen.getByRole('button', { name: 'Skip exercise' }));
    expect(screen.getByText('Rest')).toBeInTheDocument();
    tick(500);
    await user.click(screen.getByRole('button', { name: 'Skip rest' }));
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('asks before a skip that would end the workout', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { user, start } = setup(quick);
    await start();
    tick(500);
    await user.click(screen.getByRole('button', { name: 'Skip exercise' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: 'Workout complete' })).not.toBeInTheDocument();
    tick(500);
    await user.click(screen.getByRole('button', { name: 'Skip exercise' }));
    expect(screen.getByRole('heading', { name: 'Workout complete' })).toBeInTheDocument();
  });

  it('ignores a double tap on Skip', async () => {
    const { user, start } = setup(list3);
    await start();
    tick(500);
    const skipBtn = screen.getByRole('button', { name: 'Skip exercise' });
    await user.click(skipBtn);
    await user.click(skipBtn);
    expect(screen.getByText('Rest')).toBeInTheDocument(); // not B
  });

  it('Open-ended rounds: the round shows only Round done', async () => {
    const { start } = setup(flow);
    await start();
    expect(screen.getByRole('button', { name: 'Round done' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Skip/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  });

  it('Open-ended rounds: the rest has Pause and Skip rest, which starts the next round', async () => {
    const { user, start } = setup(flow);
    await start();
    await user.click(screen.getByRole('button', { name: 'Round done' }));
    tick(500);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Skip rest' }));
    expect(screen.getByText('Round 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Round done' })).toBeInTheDocument();
  });

  it('AMRAP: no skip (add rounds, undo, pause; Quit ends it)', async () => {
    const { start } = setup(amrap);
    await start();
    expect(screen.getByRole('button', { name: '+1 round' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Skip/ })).not.toBeInTheDocument();
  });
});

describe('Runner start screen has no instructional text', () => {
  it.each([
    ['Timer', list3],
    ['Open-ended rounds', flow],
    ['AMRAP', amrap],
  ])('%s: no hints about tapping', (_name, w) => {
    setup(w);
    expect(document.querySelector('.hint')).toBeNull();
    expect(document.body.textContent).not.toMatch(/tapping|Plays all the way|Plays through|at the end of each round|each time you finish/i);
  });

  it('has no wait-for-a-tap option', () => {
    setup(noPrep);
    expect(screen.queryByLabelText('Wait for a tap between rounds')).not.toBeInTheDocument();
  });

  it('the finish note box is just labelled Note', async () => {
    const { start } = setup(quick);
    await start();
    tick(5_000);
    expect(screen.getByLabelText('Note')).toHaveAttribute('placeholder', 'Note');
  });
});

describe('Runner opt-in tap options (off unless chosen in the editor)', () => {
  it('waiting between rounds: stops on Round 2 until you tap, then starts it', async () => {
    const { user, start } = setup(gated);
    await start();
    tick(40_000);
    expect(screen.getByText('Round 2')).toBeInTheDocument();
    expect(screen.queryByTestId('clock')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Skip/ })).not.toBeInTheDocument();
    tick(300_000);
    expect(screen.getByText('Round 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start round 2' }));
    expect(screen.getByText('Squats')).toBeInTheDocument();
    expect(screen.getByTestId('clock')).toHaveTextContent('0:40');
  });

  it('a plain timed workout never stops between rounds', async () => {
    const { start } = setup(noPrep);
    await start();
    tick(70_000);
    expect(screen.getByText('Round 2 of 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start round/ })).not.toBeInTheDocument();
  });

  it('tap per exercise: highlights the current exercise, and Done moves along', async () => {
    const { user, start } = setup(flowStep);
    await start();
    expect(screen.getByText('A').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByRole('button', { name: 'Round done' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    tick(500);
    expect(screen.getByText('B').closest('li')).toHaveAttribute('aria-current', 'step');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    tick(500);
    expect(screen.getByText('C').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('untimed rounds are one Round done tap unless per-exercise tapping is chosen', async () => {
    const { start } = setup(flow);
    await start();
    expect(screen.getByRole('button', { name: 'Round done' })).toBeInTheDocument();
  });
});
