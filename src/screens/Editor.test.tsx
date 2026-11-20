import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Editor } from './Editor';
import { loadLibrary, saveLibrary } from '../store/library';
import { templateFor } from '../model/templates';
import { seedWorkouts } from '../store/seed';
import type { Workout } from '../model/types';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

function setup(w: Workout) {
  saveLibrary([w]);
  const navigate = vi.fn();
  render(<Editor id={w.id} navigate={navigate} />);
  return { navigate, user: userEvent.setup(), saved: () => loadLibrary().find((x) => x.id === w.id)! };
}

const num = (label: string, value: number) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } });

describe('Editor basics', () => {
  it('shows the workout name and saves edits to it', () => {
    const w = seedWorkouts()[0];
    const { saved } = setup(w);
    expect(screen.getByLabelText('Name')).toHaveValue('Full Body A');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Leg day' } });
    expect(saved().name).toBe('Leg day');
  });

  it('edits get ready and rest between rounds as minutes and seconds', () => {
    const { saved } = setup(seedWorkouts()[0]);
    num('Get ready minutes', 1);
    num('Get ready seconds', 5);
    expect(saved().prepSeconds).toBe(65);
    num('Rest between rounds minutes', 3);
    num('Rest between rounds seconds', 0);
    expect(saved().restBetweenRounds).toBe(180);
  });

  it('Until I stop toggles rounds between null and a number', async () => {
    const { user, saved } = setup(seedWorkouts()[0]);
    const until = screen.getByLabelText('Until I stop');
    expect(until).toBeChecked();
    await user.click(until);
    expect(saved().rounds).toBe(3);
    num('Rounds', 5);
    expect(saved().rounds).toBe(5);
    await user.click(screen.getByLabelText('Until I stop'));
    expect(saved().rounds).toBeNull();
  });

  it('switches between tap per exercise and tap once per round', async () => {
    const { user, saved } = setup(seedWorkouts()[0]);
    expect(screen.getByLabelText('Tap once per round')).toBeChecked();
    await user.click(screen.getByLabelText('Tap per exercise'));
    expect(saved().advance).toBe('step');
  });

  it('shows not found for an unknown id', () => {
    saveLibrary([]);
    render(<Editor id="nope" navigate={vi.fn()} />);
    expect(screen.getByText('Workout not found')).toBeInTheDocument();
  });
});

describe('Editor steps', () => {
  it('Add step appends a step and Remove deletes one', async () => {
    const w = seedWorkouts()[2];
    const { user, saved } = setup(w);
    expect(saved().steps).toHaveLength(9);
    await user.click(screen.getByRole('button', { name: 'Add step' }));
    expect(saved().steps).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: 'Remove step 1' }));
    expect(saved().steps).toHaveLength(9);
    expect(saved().steps[0].label).toBe('Squats');
  });

  it('edits a step name and reps', () => {
    const { saved } = setup(seedWorkouts()[2]);
    fireEvent.change(screen.getByLabelText('Step 1 name'), { target: { value: 'Single Arm Rows' } });
    num('Step 1 reps', 8);
    expect(saved().steps[0]).toMatchObject({ label: 'Single Arm Rows', reps: 8 });
  });

  it('changing a step to Tap hides its time and shows reps', async () => {
    const { user, saved } = setup(templateFor('custom'));
    expect(screen.getByLabelText('Step 1 time seconds')).toBeInTheDocument();
    expect(screen.queryByLabelText('Step 1 reps')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Step 1 type'), 'tap');
    expect(screen.queryByLabelText('Step 1 time seconds')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Step 1 reps')).toBeInTheDocument();
    expect(saved().steps[0].kind).toBe('tap');
  });

  it('changes a step between work and rest', async () => {
    const { user, saved } = setup(templateFor('custom'));
    await user.selectOptions(screen.getByLabelText('Step 1 role'), 'rest');
    expect(saved().steps[0].role).toBe('rest');
  });

  it('AMRAP steps can be switched to count rounds', async () => {
    const { user, saved } = setup(templateFor('amrap'));
    const box = screen.getByLabelText('Step 1 counts rounds');
    expect(box).toBeChecked();
    await user.click(box);
    expect(saved().steps[0].counter).toBeFalsy();
  });

  it('can reorder steps with the keyboard via the drag handle', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const i = Number(this.closest('[data-step-index]')?.getAttribute('data-step-index') ?? 0);
      return { top: i * 100, bottom: i * 100 + 90, left: 0, right: 300, width: 300, height: 90, x: 0, y: i * 100 } as DOMRect;
    });
    const { user, saved } = setup(seedWorkouts()[2]);
    screen.getByRole('button', { name: 'Reorder step 1' }).focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');
    expect(saved().steps.slice(0, 2).map((s) => s.label)).toEqual(['Squats', 'Rows']);
  });
});

describe('Editor validation and leaving', () => {
  it('lists problems and disables Start until they are fixed', () => {
    const w = templateFor('custom');
    const { navigate } = setup(w);
    num('Step 1 time seconds', 0);
    expect(screen.getByText(/needs a time above 0/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    num('Step 1 time seconds', 30);
    expect(screen.queryByText(/needs a time above 0/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a workout with no steps shows an error', async () => {
    const { user } = setup(templateFor('custom'));
    await user.click(screen.getByRole('button', { name: 'Remove step 1' }));
    await user.click(screen.getByRole('button', { name: 'Remove step 1' }));
    expect(screen.getByText('Add at least one step.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('Start opens the runner', async () => {
    const w = seedWorkouts()[0];
    const { navigate, user } = setup(w);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(navigate).toHaveBeenCalledWith({ name: 'run', id: w.id });
  });

  it('an emptied name is saved as Untitled when leaving', async () => {
    const { navigate, user, saved } = setup(seedWorkouts()[0]);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });
    await user.click(screen.getByRole('button', { name: 'Back to library' }));
    expect(saved().name).toBe('Untitled');
    expect(navigate).toHaveBeenCalledWith({ name: 'library' });
  });

  it('an emptied name becomes Untitled on blur too', async () => {
    const { user, saved } = setup(seedWorkouts()[0]);
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.tab();
    expect(saved().name).toBe('Untitled');
  });
});

describe('Editor Tabata lock', () => {
  it('locks times, rounds and the step list, but not the name or get-ready', () => {
    setup(templateFor('tabata'));
    expect(screen.getByLabelText('Step 1 time seconds')).toBeDisabled();
    expect(screen.getByLabelText('Step 2 time seconds')).toBeDisabled();
    expect(screen.getByLabelText('Rounds')).toBeDisabled();
    expect(screen.getByLabelText('Until I stop')).toBeDisabled();
    expect(screen.getByLabelText('Rest between rounds seconds')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add step' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove step 1' })).toBeDisabled();
    expect(screen.getByLabelText('Step 1 type')).toBeDisabled();
    expect(screen.getByLabelText('Step 1 role')).toBeDisabled();
    expect(screen.getByLabelText('Name')).toBeEnabled();
    expect(screen.getByLabelText('Get ready seconds')).toBeEnabled();
    expect(screen.getByText(/Tabata is fixed at 20s on, 10s off, 8 rounds/)).toBeInTheDocument();
  });

  it('Convert to Custom unlocks everything and changes the mode', async () => {
    const { user, saved } = setup(templateFor('tabata'));
    await user.click(screen.getByRole('button', { name: 'Convert to Custom' }));
    expect(saved().mode).toBe('custom');
    expect(saved().steps.map((s) => s.seconds)).toEqual([20, 10]);
    expect(screen.getByLabelText('Step 1 time seconds')).toBeEnabled();
    expect(screen.getByLabelText('Rounds')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add step' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Convert to Custom' })).not.toBeInTheDocument();
  });

  it('other modes are not locked and have no Convert button', () => {
    setup(templateFor('interval'));
    expect(screen.getByLabelText('Step 1 time seconds')).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Convert to Custom' })).not.toBeInTheDocument();
  });
});
