import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from './Settings';
import { exportLibrary, loadLibrary } from '../store/library';
import { loadSettings } from '../store/settings';
import { addSession, loadHistory, type Session } from '../store/history';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const setup = () => {
  const navigate = vi.fn();
  render(<Settings navigate={navigate} />);
  return { navigate, user: userEvent.setup() };
};

const upload = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  const input = screen.getByLabelText('Import backup');
  await user.upload(input, new File([text], 'backup.json', { type: 'application/json' }));
};

describe('Settings controls', () => {
  it('shows the defaults', () => {
    setup();
    expect(screen.getByLabelText('Sound')).toBeChecked();
    expect(screen.getByLabelText('Vibration')).toBeChecked();
    expect(screen.getByLabelText('Keep screen awake')).toBeChecked();
    expect(screen.getByLabelText('Volume')).toHaveValue('0.8');
    expect(screen.getByLabelText('Countdown beeps')).toHaveValue('3');
  });

  it('persists each change', async () => {
    const { user } = setup();
    await user.click(screen.getByLabelText('Sound'));
    await user.click(screen.getByLabelText('Vibration'));
    await user.click(screen.getByLabelText('Keep screen awake'));
    fireEvent.change(screen.getByLabelText('Volume'), { target: { value: '0.4' } });
    await user.selectOptions(screen.getByLabelText('Countdown beeps'), '5');
    expect(loadSettings()).toEqual({ sound: false, vibrate: false, keepAwake: false, volume: 0.4, beepSeconds: 5, weightUnit: 'kg' });
  });

  it('Back returns to the library', async () => {
    const { navigate, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Back to library' }));
    expect(navigate).toHaveBeenCalledWith({ name: 'library' });
  });
});

describe('Settings icons', () => {
  it('uses an icon for the back button', () => {
    setup();
    expect(document.body.textContent).not.toMatch(/←/u);
    expect(screen.getByRole('button', { name: 'Back to library' }).querySelector('svg')).not.toBeNull();
  });
});

describe('Settings weight unit', () => {
  it('defaults to kg and can be switched to lb', async () => {
    const { user } = setup();
    expect(screen.getByLabelText('Weight unit')).toHaveValue('kg');
    await user.selectOptions(screen.getByLabelText('Weight unit'), 'lb');
    expect(loadSettings().weightUnit).toBe('lb');
  });
});

describe('Settings backup', () => {
  it('Export downloads the library as JSON', async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blob = b as Blob;
      return 'blob:backup';
    });
    URL.revokeObjectURL = vi.fn();
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Export backup' }));
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('workout-timer-backup.json');
    expect(await blob!.text()).toBe(exportLibrary(loadLibrary()));
  });

  it('Import adds the workouts from a valid file and says how many', async () => {
    const { user } = setup();
    const other = loadLibrary().slice(0, 2).map((w, i) => ({ ...w, id: `imp-${i}`, name: `${w.name} (imported)` }));
    await upload(user, exportLibrary(other));
    expect(await screen.findByText('Imported 2 workouts')).toBeInTheDocument();
    expect(loadLibrary()).toHaveLength(5);
  });

  it('Import of an invalid file shows the error and leaves the library alone', async () => {
    const { user } = setup();
    const before = JSON.stringify(loadLibrary());
    await upload(user, 'definitely not json');
    expect(await screen.findByRole('alert')).toHaveTextContent('That file is not valid JSON.');
    expect(JSON.stringify(loadLibrary())).toBe(before);
  });

  it('Import of a backup with an invalid workout is rejected whole', async () => {
    const { user } = setup();
    const ws = loadLibrary();
    ws[0].steps = [];
    await upload(user, exportLibrary(ws));
    expect(await screen.findByRole('alert')).toHaveTextContent('Full Body A');
    expect(loadLibrary()).toHaveLength(3);
  });

  const session = (id: string): Session => ({
    id,
    workoutId: 'w',
    workoutName: 'W',
    mode: 'interval',
    startedAt: 1,
    durationSec: 60,
    roundsDone: 1,
    laps: 0,
    completed: true,
  });

  it('Export includes the session history', async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blob = b as Blob;
      return 'blob:backup';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    addSession(session('h1'));
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Export backup' }));
    expect(await blob!.text()).toBe(exportLibrary(loadLibrary(), [session('h1')]));
  });

  it('Import brings in sessions as well as workouts, without duplicating ones you have', async () => {
    addSession(session('h1'));
    const { user } = setup();
    const one = { ...loadLibrary()[0], id: 'imp-1', name: 'Imported one' };
    const file = exportLibrary([one], [session('h1'), session('h2'), session('h3')]);
    await upload(user, file);
    expect(await screen.findByText('Imported 1 workout and 2 sessions')).toBeInTheDocument();
    expect(loadHistory().map((s) => s.id)).toEqual(['h1', 'h2', 'h3']);
  });

  it('importing a backup you already have says there is nothing new, and does not duplicate', async () => {
    const { user } = setup();
    const file = exportLibrary(loadLibrary(), []);
    await upload(user, file);
    expect(await screen.findByText(/Nothing new to import/)).toBeInTheDocument();
    expect(loadLibrary()).toHaveLength(3);
  });
});
