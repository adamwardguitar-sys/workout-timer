import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

beforeEach(() => localStorage.clear());

describe('App', () => {
  it('shows library by default', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
  });

  it('a workout created in the library is found by the editor it opens', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'New workout' }));
    await user.click(screen.getByRole('button', { name: /^Tabata/ }));
    expect(screen.getByLabelText('Name')).toHaveValue('New Tabata');
    expect(screen.queryByText('Workout not found')).not.toBeInTheDocument();
  });

  it('edits made in the editor are in the library after going back', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Full Body A' }));
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Push day');
    await user.click(screen.getByRole('button', { name: 'Back to library' }));
    expect(screen.getByRole('button', { name: 'Push day' })).toBeInTheDocument();
  });

  it('has a bottom tab bar on the main screens that switches between them', async () => {
    const user = userEvent.setup();
    render(<App />);
    const tabs = screen.getByRole('navigation', { name: 'Main' });
    expect(within(tabs).getByRole('button', { name: 'Workouts' })).toHaveAttribute('aria-current', 'page');
    await user.click(within(tabs).getByRole('button', { name: 'History' }));
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(within(tabs).getByRole('button', { name: 'History' })).toHaveAttribute('aria-current', 'page');
    await user.click(within(tabs).getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    await user.click(within(tabs).getByRole('button', { name: 'Workouts' }));
    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
  });

  it('hides the tab bar while editing and while running a workout', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Full Body A' }));
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to library' }));
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start Full Body A' }));
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });
});
