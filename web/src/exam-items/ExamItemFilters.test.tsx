import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExamItemFilters, type ExamItemFilterValues } from './ExamItemFilters';

const EMPTY: ExamItemFilterValues = { status: '', kind: '', tag: '' };

describe('ExamItemFilters', () => {
  it('смена статуса вызывает onChange с новым значением', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExamItemFilters values={EMPTY} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Статус'), 'draft');

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, status: 'draft' });
  });

  it('смена типа вызывает onChange с новым значением', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExamItemFilters values={EMPTY} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Тип'), 'single');

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, kind: 'single' });
  });

  it('тег — печатать не отправляет запрос сразу, «Enter» коммитит значение', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExamItemFilters values={EMPTY} onChange={onChange} />);

    await user.type(screen.getByLabelText('Тег'), 'ян');
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, tag: 'ян' });
  });

  it('тег — уход с поля (blur) тоже коммитит значение', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <ExamItemFilters values={EMPTY} onChange={onChange} />
        <button type="button">Вне поля</button>
      </>,
    );

    await user.type(screen.getByLabelText('Тег'), ' база ');
    await user.click(screen.getByRole('button', { name: 'Вне поля' }));

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, tag: 'база' });
  });

  it('тег не менялся — blur не вызывает onChange заново', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <ExamItemFilters values={EMPTY} onChange={onChange} />
        <button type="button">Вне поля</button>
      </>,
    );

    await user.click(screen.getByLabelText('Тег'));
    await user.click(screen.getByRole('button', { name: 'Вне поля' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('внешний сброс фильтра тега обновляет поле', () => {
    const { rerender } = render(
      <ExamItemFilters values={{ ...EMPTY, tag: 'ян' }} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Тег')).toHaveValue('ян');

    rerender(<ExamItemFilters values={EMPTY} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Тег')).toHaveValue('');
  });
});
