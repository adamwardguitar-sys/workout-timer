import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Library } from './Library';
import { LIBRARY_KEY, listCorrupt, loadLibrary, saveLibrary } from '../store/library';
import { seedWorkouts } from '../store/seed';
import { saveActiveRun } from '../store/activeRun';
import { addSession } from '../store/history';
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

  describe('unreadable data notice', () => {
    it('is not shown when everything loaded fine', () => {
      setup();
      expect(screen.queryByText(/could not be read/)).not.toBeInTheDocument();
    });

    it('tells you some saved workouts could not be read, and offers the data back', async () => {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify([seedWorkouts()[0], { id: 'broken' }]));
      let blob: Blob | undefined;
      URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
        blob = b as Blob;
        return 'blob:x';
      });
      URL.revokeObjectURL = vi.fn();
      const clicks: string[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push(this.download);
      });
      const { user } = setup();
      expect(screen.getByText(/could not be read/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Download unreadable data' }));
      expect(clicks).toEqual(['workout-timer-unreadable-data.json']);
      expect(await blob!.text()).toContain('broken');
    });

    it('Dismiss asks first, then forgets the unreadable copy', async () => {
      localStorage.setItem(LIBRARY_KEY, '{bad');
      const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
      const { user } = setup();
      await user.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.getByText(/could not be read/)).toBeInTheDocument();
      expect(listCorrupt()).toHaveLength(1);
      await user.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/could not be read/)).not.toBeInTheDocument();
      expect(listCorrupt()).toEqual([]);
    });
  });

  describe('card history', () => {
    const logged = (id: string, workoutId: string, startedAt: number) => ({
      id,
      workoutId,
      workoutName: 'x',
      mode: 'interval' as const,
      startedAt,
      durationSec: 600,
      roundsDone: 1,
      laps: 0,
      completed: true,
    });

    it('shows when each workout was last done and how many times', () => {
      const [a] = loadLibrary();
      const day = 86_400_000;
      addSession(logged('1', a.id, Date.now() - 3 * day));
      addSession(logged('2', a.id, Date.now() - 10 * day));
      setup();
      const card = screen.getByRole('button', { name: 'Full Body A' }).closest('li')!;
      expect(within(card).getByText('Last done 3 days ago · 2 sessions')).toBeInTheDocument();
    });

    it('says nothing for a workout you have not done', () => {
      setup();
      expect(screen.queryByText(/Last done/)).not.toBeInTheDocument();
    });
  });
});
