import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EXAM_STATUSES, type ExamStatus } from '@xuanxue/shared';
import { DRAFT_PUBLISHED_ARCHIVED_LABELS_RU } from '../lib/statusTransitions';
import { ListFilters } from './ListFilters';

function renderFilters(
  value: ExamStatus | '' = '',
  onChange = vi.fn(),
  search = '',
  onSearchChange = vi.fn(),
) {
  render(
    <ListFilters
      statuses={EXAM_STATUSES}
      labels={DRAFT_PUBLISHED_ARCHIVED_LABELS_RU}
      value={value}
      onChange={onChange}
      searchLabel="Поиск по названию"
      search={search}
      onSearchChange={onSearchChange}
    />,
  );
  return { onChange, onSearchChange };
}

describe('ListFilters', () => {
  it('«Все» нажат по умолчанию', () => {
    renderFilters();

    expect(screen.getByRole('button', { name: 'Все' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('клик по статусу вызывает onChange с новым значением', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();

    await user.click(screen.getByRole('button', { name: 'Опубликован' }));

    expect(onChange).toHaveBeenCalledWith('published');
  });

  it('клик по «Все» сбрасывает фильтр', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters('archived');

    await user.click(screen.getByRole('button', { name: 'Все' }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('текущий статус помечен нажатым', () => {
    renderFilters('archived');

    expect(screen.getByRole('button', { name: 'В архиве' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Все' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('поиск — ввод сразу вызывает onSearchChange', () => {
    const { onSearchChange } = renderFilters();

    fireEvent.change(screen.getByLabelText('Поиск по названию'), {
      target: { value: 'форма' },
    });

    expect(onSearchChange).toHaveBeenCalledWith('форма');
  });
});
