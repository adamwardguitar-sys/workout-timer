import { act, fireEvent, render, screen } from '@testing-library/react';
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
const flowStep: Workout = { ...flow, id: 'flowstep', advance: 'step', steps: [tapStep('A'), tapStep('B'), tapStep('C')] };
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
  };
}

const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

function setup(w: Workout, opts: { skipStart?: boolean } = {}) {
  saveLibrary([interval, noPrep, flow, flowStep, quick, amrap]);
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
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(cues(sound)).toContain('rest');
    expect(screen.getByText('Rest')).toBeInTheDocument();
    expect(clock()).toHaveTextContent('2:00');
    await user.click(screen.getByRole('button', { name: 'Add 15 seconds' }));
    expect(clock()).toHaveTextContent('2:15');
    await user.click(screen.getByRole('button', { name: 'Remove 15 seconds' }));
    await user.click(screen.getByRole('button', { name: 'Remove 15 seconds' }));
    expect(clock()).toHaveTextContent('1:45');
    tick(105_000);
    expect(screen.getByText('Round 2')).toBeInTheDocument();
    expect(screen.getByText('5 Rows')).toBeInTheDocument();
  });

  it('tap per exercise highlights the current exercise and Done moves along', async () => {
    const { user, start } = setup(flowStep);
    await start();
    expect(screen.getByText('A').closest('li')).toHaveAttribute('aria-current', 'step');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('B').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('Skip and Previous move between segments', async () => {
    const { user, start } = setup(noPrep);
    await start();
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByText('Rest')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Squats')).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: '+1 round' }));
    expect(screen.getByText('Rounds: 2')).toBeInTheDocument();
    tick(600_000);
    expect(screen.getByRole('heading', { name: 'Workout complete' })).toBeInTheDocument();
    expect(screen.getByText('Rounds: 2')).toBeInTheDocument();
  });
});

describe('Runner resume and quit', () => {
  it('reopens a saved run with the clock moved on, and a tap unlocks the sound', async () => {
    saveActiveRun(startRun(interval, Date.now()));
    vi.setSystemTime(Date.now() + 15_000);
    saveLibrary([interval]);
    const sound = fakeSound();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Runner id="interval" navigate={vi.fn()} sound={sound} />);
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
