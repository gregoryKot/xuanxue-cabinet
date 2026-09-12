import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExamFilters, type ExamFilterValues } from './ExamFilters';

const EMPTY: ExamFilterValues = { status: '', level: '' };

describe('ExamFilters', () => {
  it('смена статуса вызывает onChange с новым значением', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExamFilters values={EMPTY} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Статус'), 'published');

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, status: 'published' });
  });

  it('уровень — печатать не отправляет запрос сразу, «Enter» коммитит значение', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExamFilters values={EMPTY} onChange={onChange} />);

    await user.type(screen.getByLabelText('Уровень'), 'база');
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, level: 'база' });
  });

  it('уровень — уход с поля (blur) тоже коммитит значение', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <ExamFilters values={EMPTY} onChange={onChange} />
        <button type="button">Вне поля</button>
      </>,
    );

    await user.type(screen.getByLabelText('Уровень'), ' начальный ');
    await user.click(screen.getByRole('button', { name: 'Вне поля' }));

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, level: 'начальный' });
  });

  it('внешний сброс фильтра уровня обновляет поле', () => {
    const { rerender } = render(
      <ExamFilters values={{ ...EMPTY, level: 'база' }} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Уровень')).toHaveValue('база');

    rerender(<ExamFilters values={EMPTY} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Уровень')).toHaveValue('');
  });
});
