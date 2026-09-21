// Строка тега (экран тега, ADR-0075) — числа, выбор, aria-pressed,
// последняя строка без разделителя.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TagSummaryDto } from '@xuanxue/shared';
import { TagSummaryRow } from './TagSummaryRow';

function makeSummary(overrides: Partial<TagSummaryDto> = {}): TagSummaryDto {
  return { tag: 'дракон', lessonCount: 3, materialCount: 2, ...overrides };
}

describe('TagSummaryRow', () => {
  it('тег и оба числа рядом', () => {
    render(
      <ul>
        <TagSummaryRow summary={makeSummary()} selected={false} onSelect={vi.fn()} />
      </ul>,
    );

    expect(screen.getByText('дракон')).toBeInTheDocument();
    expect(screen.getByText('3 занятия · 2 материала')).toBeInTheDocument();
  });

  it('клик — вызывает onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ul>
        <TagSummaryRow summary={makeSummary()} selected={false} onSelect={onSelect} />
      </ul>,
    );

    await user.click(screen.getByText('дракон'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('выбранный тег — aria-pressed true, невыбранный — false', () => {
    render(
      <ul>
        <TagSummaryRow summary={makeSummary()} selected onSelect={vi.fn()} />
      </ul>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('последняя строка — без нижней волосяной линии, у остальных линия есть', () => {
    render(
      <ul>
        <TagSummaryRow
          summary={makeSummary({ tag: 'первый' })}
          selected={false}
          onSelect={vi.fn()}
        />
        <TagSummaryRow
          summary={makeSummary({ tag: 'второй' })}
          selected={false}
          onSelect={vi.fn()}
          isLast
        />
      </ul>,
    );

    const firstRow = screen.getByText('первый').closest('li');
    const lastRow = screen.getByText('второй').closest('li');
    expect(firstRow?.style.borderBottom).toBe('1px solid var(--panel)');
    expect(lastRow?.style.borderBottomStyle).toBe('none');
  });
});
