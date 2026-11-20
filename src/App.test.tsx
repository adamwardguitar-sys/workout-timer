import { render, screen } from '@testing-library/react';
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
});
