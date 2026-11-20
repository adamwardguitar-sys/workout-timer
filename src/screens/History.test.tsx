import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { History } from './History';
import { loadHistory, saveHistory, type Session } from '../store/history';
import { saveSettings, DEFAULT_SETTINGS } from '../store/settings';

const at = (m: number, d: number, h = 9) => new Date(2026, m - 1, d, h, 0).getTime();
const NOW = at(11, 20, 12); // Friday 20 Nov 2026

const sess = (id: string, startedAt: number, over: Partial<Session> = {}): Session => ({
  id,
  workoutId: 'w1',
  workoutName: 'Full Body A',
  mode: 'interval',
  startedAt,
  durationSec: 600,
  roundsDone: 1,
  laps: 0,
  completed: true,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const setup = (list: Session[] = []) => {
  saveHistory(list);
  render(<History now={NOW} />);
  return { user: userEvent.setup() };
};

describe('History empty', () => {
  it('invites you to finish a workout', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByText(/No sessions yet/)).toBeInTheDocument();
    expect(screen.getByTestId('tile-week')).toHaveTextContent('0');
  });
});

describe('History with sessions', () => {
  const list = [
    sess('a', at(11, 20, 8), { durationSec: 900 }),
    sess('b', at(11, 19, 8), { durationSec: 600 }),
    sess('c', at(11, 18, 8), { durationSec: 1200, completed: false, workoutName: 'Kettle', note: 'felt heavy' }),
    sess('d', at(11, 10, 8)),
  ];

  it('shows this week, the last four weeks and the total (no streak to chase)', () => {
    setup(list);
    expect(screen.getByTestId('tile-week')).toHaveTextContent('3');
    expect(screen.getByTestId('tile-week')).toHaveTextContent('45 min');
    expect(screen.getByTestId('tile-month')).toHaveTextContent('4');
    expect(screen.getByTestId('tile-month')).toHaveTextContent('1.0 per week');
    expect(screen.getByTestId('tile-total')).toHaveTextContent('4');
    expect(screen.queryByTestId('tile-streak')).not.toBeInTheDocument();
  });

  it('draws a 4-week grid with an accessible label per day', () => {
    setup(list);
    const grid = screen.getByLabelText('Last 4 weeks');
    expect(within(grid).getAllByRole('button')).toHaveLength(28);
    expect(within(grid).getByRole('button', { name: 'Fri 20 Nov: 1 session, 15 min' })).toBeEnabled();
    expect(within(grid).getByRole('button', { name: 'Thu 19 Nov: 1 session, 10 min' })).toBeEnabled();
    expect(within(grid).getByRole('button', { name: 'Wed 11 Nov: no sessions' })).toBeDisabled();
    expect(within(grid).getByRole('button', { name: 'Sat 21 Nov: upcoming' })).toBeDisabled();
  });

  it('lists sessions by day, newest first, marking early finishes and showing notes', () => {
    setup(list);
    expect(screen.getByText('Today · Fri 20 Nov')).toBeInTheDocument();
    expect(screen.getByText('Yesterday · Thu 19 Nov')).toBeInTheDocument();
    const items = screen.getAllByRole('article');
    expect(items).toHaveLength(4);
    expect(within(items[2]).getByText('Kettle')).toBeInTheDocument();
    expect(within(items[2]).getByText('Ended early')).toBeInTheDocument();
    expect(within(items[2]).getByText('felt heavy')).toBeInTheDocument();
    expect(within(items[0]).queryByText('Ended early')).not.toBeInTheDocument();
  });

  it('adds and edits a note', async () => {
    const { user } = setup(list);
    const first = screen.getAllByRole('article')[0];
    await user.click(within(first).getByRole('button', { name: 'Add note' }));
    await user.type(within(first).getByLabelText('Note'), 'new PB');
    await user.click(within(first).getByRole('button', { name: 'Save' }));
    expect(loadHistory().find((s) => s.id === 'a')?.note).toBe('new PB');
    expect(within(screen.getAllByRole('article')[0]).getByText('new PB')).toBeInTheDocument();
    await user.click(within(screen.getAllByRole('article')[0]).getByRole('button', { name: 'Edit note' }));
    expect(within(screen.getAllByRole('article')[0]).getByLabelText('Note')).toHaveValue('new PB');
  });

  it('cancelling a note edit changes nothing', async () => {
    const { user } = setup(list);
    const first = screen.getAllByRole('article')[0];
    await user.click(within(first).getByRole('button', { name: 'Add note' }));
    await user.type(within(first).getByLabelText('Note'), 'oops');
    await user.click(within(first).getByRole('button', { name: 'Cancel' }));
    expect(loadHistory().find((s) => s.id === 'a')?.note).toBeUndefined();
  });

  it('deletes a session after confirming', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { user } = setup(list);
    const del = () => within(screen.getAllByRole('article')[0]).getByRole('button', { name: 'Delete session' });
    await user.click(del());
    expect(screen.getAllByRole('article')).toHaveLength(4);
    await user.click(del());
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(loadHistory().map((s) => s.id)).not.toContain('a');
  });

  it('tapping a day shows just that day, and Show all brings everything back', async () => {
    const { user } = setup(list);
    await user.click(screen.getByRole('button', { name: 'Thu 19 Nov: 1 session, 10 min' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('Yesterday · Thu 19 Nov')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thu 19 Nov: 1 session, 10 min' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getAllByRole('article')).toHaveLength(4);
  });
});

describe('History weights', () => {
  const tracked = ['Goblet Squat', 'Bicep Curls'];
  const wlist = [
    sess('old', at(11, 2, 8), { tracked, weights: [{ exercise: 'Goblet Squat', value: 12 }], unit: 'kg' }),
    sess('mid', at(11, 16, 8), { tracked, weights: [{ exercise: 'Goblet Squat', value: 16 }, { exercise: 'Bicep Curls', value: 8 }], unit: 'kg' }),
    sess('new', at(11, 19, 8), { tracked }),
    sess('plain', at(11, 18, 8)),
  ];

  it('shows the weights on a session and offers to add or edit them only where exercises are tracked', () => {
    setup(wlist);
    const items = screen.getAllByRole('article');
    const byName = (id: string) => items[wlist.map((x) => x.id).sort((a, b) => 0).indexOf(id)];
    void byName;
    expect(screen.getByText('Goblet Squat 16 kg · Bicep Curls 8 kg')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit weights' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Add weights' })).toHaveLength(1);
  });

  it('adds weights to a session', async () => {
    const { user } = setup(wlist);
    await user.click(screen.getByRole('button', { name: 'Add weights' }));
    await user.type(screen.getByLabelText('Weight for Goblet Squat'), '18');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(loadHistory().find((x) => x.id === 'new')?.weights).toEqual([{ exercise: 'Goblet Squat', value: 18 }]);
    expect(loadHistory().find((x) => x.id === 'new')?.unit).toBe('kg');
  });

  it('uses the unit from settings when saving', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, weightUnit: 'lb' });
    const { user } = setup(wlist);
    await user.click(screen.getByRole('button', { name: 'Add weights' }));
    await user.type(screen.getByLabelText('Weight for Goblet Squat'), '40');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(loadHistory().find((x) => x.id === 'new')?.unit).toBe('lb');
  });

  it('lists each exercise with its latest weight and how it changed', () => {
    setup(wlist);
    const section = screen.getByRole('region', { name: 'Exercise weights' });
    expect(within(section).getByText('Goblet Squat')).toBeInTheDocument();
    expect(within(section).getByText('16 kg')).toBeInTheDocument();
    expect(within(section).getByText(/up from 12 kg/)).toBeInTheDocument();
    expect(within(section).getByText('Bicep Curls')).toBeInTheDocument();
    expect(within(section).getByText(/first logged/)).toBeInTheDocument();
  });

  it('has no weights section when nothing was logged', () => {
    setup([sess('a', at(11, 19))]);
    expect(screen.queryByRole('region', { name: 'Exercise weights' })).not.toBeInTheDocument();
  });

  it('tapping an exercise with more than one logged weight shows its chart, and tapping again hides it', async () => {
    const { user } = setup(wlist);
    const row = screen.getByRole('button', { name: /Goblet Squat/ });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: /Goblet Squat weight over time/ })).not.toBeInTheDocument();
    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: /Goblet Squat weight over time: 12 kg on 2 Nov to 16 kg on 16 Nov, 2 sessions/ })).toBeInTheDocument();
    await user.click(row);
    expect(screen.queryByRole('group', { name: /Goblet Squat weight over time/ })).not.toBeInTheDocument();
  });

  it('an exercise logged only once has nothing to chart yet', () => {
    setup(wlist);
    expect(screen.queryByRole('button', { name: /Bicep Curls/ })).not.toBeInTheDocument();
  });

  it('only one chart is open at a time', async () => {
    const many = [
      sess('a', at(11, 2, 8), { tracked: ['X', 'Y'], weights: [{ exercise: 'X', value: 1 }, { exercise: 'Y', value: 5 }], unit: 'kg' }),
      sess('b', at(11, 9, 8), { tracked: ['X', 'Y'], weights: [{ exercise: 'X', value: 2 }, { exercise: 'Y', value: 6 }], unit: 'kg' }),
    ];
    const { user } = setup(many);
    await user.click(screen.getByRole('button', { name: /^X/ }));
    await user.click(screen.getByRole('button', { name: /^Y/ }));
    expect(screen.queryByRole('group', { name: /^X weight/ })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Y weight/ })).toBeInTheDocument();
  });
});
