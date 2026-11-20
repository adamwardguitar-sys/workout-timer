import { render, screen } from '@testing-library/react';
import { TabBar } from './TabBar';

describe('TabBar icons', () => {
  it('uses one consistent set of SVG icons, with no emoji or text glyphs', () => {
    const { container } = render(<TabBar route={{ name: 'library' }} navigate={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(container.querySelectorAll('nav svg')).toHaveLength(3);
    expect(nav.textContent).toBe('WorkoutsHistorySettings');
  });
});
