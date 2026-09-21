// Значки нижней панели телефона (ADR-0097) — каждое имя рисует свой узнаваемый
// контур, decorative-only.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { NavIconName } from './navItems';
import { NavIcon } from './NavIcon';

const NAMES: NavIconName[] = [
  'lessons',
  'broadcasts',
  'exams',
  'people',
  'materials',
  'tasks',
];

describe('NavIcon (ADR-0097)', () => {
  it.each(NAMES)('%s — svg с aria-hidden', (name) => {
    const { container } = render(<NavIcon name={name} />);

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('разные имена дают разную разметку', () => {
    const markup = NAMES.map((name) => {
      const { container, unmount } = render(<NavIcon name={name} />);
      const html = container.querySelector('svg')?.innerHTML ?? '';
      unmount();
      return html;
    });

    expect(new Set(markup).size).toBe(markup.length);
  });
});
