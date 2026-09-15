import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExamFilters, type ExamFilterValues } from './ExamFilters';

const EMPTY: ExamFilterValues = { status: '' };

function renderFilters(
  values: ExamFilterValues = EMPTY,
  onChange = vi.fn(),
  search = '',
  onSearchChange = vi.fn(),
) {
  render(
    <ExamFilters
      values={values}
      onChange={onChange}
      search={search}
      onSearchChange={onSearchChange}
    />,
  );
  return { onChange, onSearchChange };
}

describe('ExamFilters', () => {
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

    expect(onChange).toHaveBeenCalledWith({ status: 'published' });
  });

  it('текущий статус помечен нажатым', () => {
    renderFilters({ status: 'archived' });

    expect(screen.getByRole('button', { name: 'В архиве' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Все' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('поиск по названию — ввод сразу вызывает onSearchChange', () => {
    const { onSearchChange } = renderFilters();

    fireEvent.change(screen.getByLabelText('Поиск по названию'), {
      target: { value: 'форма' },
    });

    expect(onSearchChange).toHaveBeenCalledWith('форма');
  });
});
