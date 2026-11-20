import { render } from '@testing-library/react';
import { ICON_NAMES, Icon, MODE_ICONS } from './Icon';

describe('Icon', () => {
  it('renders every icon as a decorative inline SVG that follows the text colour', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector('svg')!;
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg.innerHTML.length).toBeGreaterThan(20);
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      unmount();
    }
  });

  it('can be sized', () => {
    const { container } = render(<Icon name="play" size={40} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '40');
  });

  it('has an icon for every workout mode', () => {
    for (const mode of ['interval', 'tabata', 'emom', 'amrap', 'flow', 'custom'] as const) {
      expect(ICON_NAMES).toContain(MODE_ICONS[mode]);
    }
  });
});
