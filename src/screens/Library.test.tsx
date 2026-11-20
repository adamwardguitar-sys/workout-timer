import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Library } from './Library';
import { loadLibrary, saveLibrary } from '../store/library';
import { seedWorkouts } from '../store/seed';
import { saveActiveRun } from '../store/activeRun';
import { startRun } from '../engine/runner';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const setup = () => {
  const navigate = vi.fn();
  render(<Library navigate={navigate} />);
  return { navigate, user: userEvent.setup() };
};

describe('Library', () => {
  it('lists the seed workouts under the Library heading', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full Body A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full Body B' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kettlebell Rounds (Athenian Complex)' })).toBeInTheDocument();
  });

  it('New workout offers the six modes and creates a template then opens its editor', async () => {
    const { navigate, user } = setup();
    await user.click(screen.getByRole('button', { name: 'New workout' }));
    const picker = screen.getByRole('dialog');
    for (const m of ['Interval', 'Tabata', 'EMOM', 'AMRAP', 'Kettlebell Flow', 'Custom']) {
      expect(within(picker).getByRole('button', { name: new RegExp(`^${m}`) })).toBeInTheDocument();
    }
    await user.click(within(picker).getByRole('button', { name: /^Tabata/ }));
    const ws = loadLibrary();
    expect(ws).toHaveLength(4);
    expect(ws[3].mode).toBe('tabata');
    expect(navigate).toHaveBeenCalledWith({ name: 'editor', id: ws[3].id });
  });

  it('Duplicate adds a copy', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Duplicate Full Body A' }));
    expect(screen.getByRole('button', { name: 'Full Body A copy' })).toBeInTheDocument();
  });

  it('Delete asks for confirmation, then removes', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Delete Full Body B' }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Full Body B' })).not.toBeInTheDocument();
  });

  it('cancelling the delete confirmation keeps the workout', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Delete Full Body B' }));
    expect(screen.getByRole('button', { name: 'Full Body B' })).toBeInTheDocument();
  });

  it('Start opens the runner and the title opens the editor', async () => {
    const { navigate, user } = setup();
    const first = loadLibrary()[0];
    await user.click(screen.getByRole('button', { name: 'Start Full Body A' }));
    expect(navigate).toHaveBeenCalledWith({ name: 'run', id: first.id });
    await user.click(screen.getByRole('button', { name: 'Full Body A' }));
    expect(navigate).toHaveBeenCalledWith({ name: 'editor', id: first.id });
  });

  it('the settings button opens settings', async () => {
    const { navigate, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(navigate).toHaveBeenCalledWith({ name: 'settings' });
  });

  it('disables Start for a workout that fails validation', () => {
    const ws = seedWorkouts();
    ws[0].steps = [];
    saveLibrary(ws);
    setup();
    expect(screen.getByRole('button', { name: 'Start Full Body A' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start Full Body B' })).toBeEnabled();
  });

  it('shows Untitled for a workout with an empty name', () => {
    const ws = seedWorkouts();
    ws[0].name = '';
    saveLibrary(ws);
    setup();
    expect(screen.getByRole('button', { name: 'Untitled' })).toBeInTheDocument();
  });

  it('can reorder with the keyboard via the drag handle', async () => {
    const rect = (el: Element) => {
      const i = Number(el.closest('[data-card-index]')?.getAttribute('data-card-index') ?? 0);
      return { top: i * 100, bottom: i * 100 + 90, left: 0, right: 300, width: 300, height: 90, x: 0, y: i * 100 } as DOMRect;
    };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return rect(this);
    });
    const { user } = setup();
    const before = loadLibrary().map((w) => w.name);
    screen.getByRole('button', { name: 'Reorder Full Body A' }).focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');
    const after = loadLibrary().map((w) => w.name);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  });

  it('offers to resume a saved run', async () => {
    const w = seedWorkouts()[1];
    saveActiveRun(startRun(w, Date.now()));
    const { navigate, user } = setup();
    await user.click(screen.getByRole('button', { name: /Resume workout/ }));
    expect(navigate).toHaveBeenCalledWith({ name: 'run', id: w.id });
  });

  it('shows no resume banner when there is no saved run', () => {
    setup();
    expect(screen.queryByRole('button', { name: /Resume workout/ })).not.toBeInTheDocument();
  });

  it('does not offer to resume a run that finished while the app was closed', () => {
    const w = { ...seedWorkouts()[1], prepSeconds: 0, rounds: 1, restBetweenRounds: 0, advance: 'step' as const,
      steps: [{ id: 'g', label: 'Go', kind: 'timed' as const, role: 'work' as const, seconds: 5 }] };
    saveLibrary([w]);
    saveActiveRun(startRun(w, Date.now() - 60_000));
    setup();
    expect(screen.queryByRole('button', { name: /Resume workout/ })).not.toBeInTheDocument();
  });
});
