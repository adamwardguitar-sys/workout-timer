import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { History } from './History';
import { loadHistory, saveHistory, type Session } from '../store/history';

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

  it('shows this week, the streak and the total', () => {
    setup(list);
    expect(screen.getByTestId('tile-week')).toHaveTextContent('3');
    expect(screen.getByTestId('tile-week')).toHaveTextContent('45 min');
    expect(screen.getByTestId('tile-streak')).toHaveTextContent('3');
    expect(screen.getByTestId('tile-total')).toHaveTextContent('4');
  });

  it('draws a 4-week grid with an accessible label per day', () => {
    setup(list);
    const grid = screen.getByLabelText('Last 4 weeks');
    expect(within(grid).getAllByRole('img')).toHaveLength(28);
    expect(within(grid).getByRole('img', { name: 'Fri 20 Nov: 1 session, 15 min' })).toBeInTheDocument();
    expect(within(grid).getByRole('img', { name: 'Thu 19 Nov: 1 session, 10 min' })).toBeInTheDocument();
    expect(within(grid).getByRole('img', { name: 'Wed 11 Nov: no sessions' })).toBeInTheDocument();
    expect(within(grid).getByRole('img', { name: 'Sat 21 Nov: upcoming' })).toBeInTheDocument();
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
});
