import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('shows library by default', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
  });
});
