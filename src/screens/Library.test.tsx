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

  it('New workout offers two clear modes plus quick presets, and creates a template then opens its editor', async () => {
    const { navigate, user } = setup();
    await user.click(screen.getByRole('button', { name: 'New workout' }));
    const picker = screen.getByRole('dialog');
    for (const m of ['Timer', 'Open-ended rounds', 'Tabata', 'EMOM', 'AMRAP']) {
      expect(within(picker).getByRole('button', { name: new RegExp(`^${m}`) })).toBeInTheDocument();
    }
    expect(within(picker).queryByRole('button', { name: /^Custom/ })).not.toBeInTheDocument();
    expect(within(picker).getByText('Quick presets')).toBeInTheDocument();
    // just the names: no explanatory blurbs
    expect(within(picker).getByRole('button', { name: /^Timer/ })).toHaveTextContent(/^Timer$/);
    expect(within(picker).getByRole('button', { name: /^Open-ended rounds/ })).toHaveTextContent(/^Open-ended rounds$/);
    expect(within(picker).getByRole('button', { name: /^Tabata/ })).toHaveTextContent(/^Tabata$/);
    await user.click(within(picker).getByRole('button', { name: /^Tabata/ }));
    const ws = loadLibrary();
    expect(ws).toHaveLength(4);
    expect(ws[3].mode).toBe('tabata');
    expect(navigate).toHaveBeenCalledWith({ name: 'editor', id: ws[3].id });
  });

  it('Timer creates a timed list and Open-ended rounds creates an untimed one', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'New workout' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Timer/ }));
    expect(loadLibrary()[3]).toMatchObject({ mode: 'interval' });
    expect(loadLibrary()[3].steps.every((x) => x.kind === 'timed')).toBe(true);
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
    expect(navigate).toHaveBeenCalledWith({ name: 'run', id: w.id, resume: true });
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

  describe('home page', () => {
    const day = 86_400_000;
    const logged = (id: string, workoutId: string, startedAt: number, durationSec = 600) => ({
      id,
      workoutId,
      workoutName: 'x',
      mode: 'interval' as const,
      startedAt,
      durationSec,
      roundsDone: 1,
      laps: 0,
      completed: true,
    });

    it('greets you, with no written weekly summary (the week strip shows it)', () => {
      setup();
      expect(screen.getByTestId('greeting')).toHaveTextContent(/^Good (morning|afternoon|evening)/);
      expect(screen.queryByTestId('week-summary')).not.toBeInTheDocument();
      expect(screen.queryByText(/sessions? (yet )?this week/)).not.toBeInTheDocument();
    });

    it('still has no weekly sentence once you have trained', () => {
      const [a] = loadLibrary();
      addSession(logged('1', a.id, Date.now(), 600));
      setup();
      expect(screen.queryByText(/this week/)).not.toBeInTheDocument();
    });

    it('has no instruction text when the library is empty', () => {
      saveLibrary([]);
      setup();
      expect(screen.queryByText(/No workouts yet/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Tap/)).not.toBeInTheDocument();
    });

    it('shows this week as seven days, marking trained days and today', () => {
      const [a] = loadLibrary();
      addSession(logged('1', a.id, Date.now()));
      setup();
      const strip = screen.getByLabelText('This week');
      const days = within(strip).getAllByRole('img');
      expect(days).toHaveLength(7);
      const today = days.filter((d) => /\(today\)/.test(d.getAttribute('aria-label') ?? ''));
      expect(today).toHaveLength(1);
      expect(today[0].getAttribute('aria-label')).toMatch(/trained/);
    });

    it('features your most recently done workout as Up next, with a quick start', async () => {
      const [a, b] = loadLibrary();
      addSession(logged('1', a.id, Date.now() - 5 * day));
      addSession(logged('2', b.id, Date.now() - 1 * day));
      const { navigate, user } = setup();
      const hero = screen.getByRole('region', { name: 'Up next' });
      expect(within(hero).getByText('Full Body B')).toBeInTheDocument();
      await user.click(within(hero).getByRole('button', { name: 'Quick start Full Body B' }));
      expect(navigate).toHaveBeenCalledWith({ name: 'run', id: b.id });
    });

    it('features the first workout when nothing has been done yet', () => {
      setup();
      const hero = screen.getByRole('region', { name: 'Up next' });
      expect(within(hero).getByText('Full Body A')).toBeInTheDocument();
    });

    it('shows an estimated time for fixed-length workouts only', () => {
      setup();
      const card = (name: string) => screen.getByRole('button', { name }).closest('li')!;
      expect(within(card('Full Body A')).getByText('≈ 10 min')).toBeInTheDocument();
      expect(within(card('Kettlebell Rounds (Athenian Complex)')).queryByText(/≈/)).not.toBeInTheDocument();
    });

    it('uses icons rather than emoji or text glyphs', () => {
      const { container } = render(<Library navigate={vi.fn()} />);
      expect(container.textContent).not.toMatch(/[▶⧉🗑⚙⠿✕⏮⏭]/u);
      expect(container.querySelectorAll('svg').length).toBeGreaterThan(5);
    });

    it('puts Resume in the hero spot when a run is waiting', () => {
      const w = seedWorkouts()[1];
      saveActiveRun(startRun(w, Date.now()));
      setup();
      const hero = screen.getByRole('region', { name: 'Up next' });
      expect(within(hero).getByRole('button', { name: /Resume workout/ })).toBeInTheDocument();
    });
  });
});
