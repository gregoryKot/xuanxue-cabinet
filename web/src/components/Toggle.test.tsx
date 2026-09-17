import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Toggle } from './Toggle';

describe('Toggle', () => {
  it('отражает checked и находится по подписи', () => {
    render(<Toggle label="Занятие активно" checked onChange={vi.fn()} />);
    expect(screen.getByLabelText('Занятие активно')).toBeChecked();
  });

  it('клик вызывает onChange с противоположным значением', async () => {
    const onChange = vi.fn();
    render(<Toggle label="Занятие активно" checked={false} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('Занятие активно'));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('с объяснением — оно видно, но в доступное имя поля не попадает', () => {
    render(
      <Toggle
        label="Перемешивать вопросы"
        hint="У каждого ученика свой порядок"
        checked={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('У каждого ученика свой порядок')).toBeInTheDocument();
    expect(screen.getByLabelText('Перемешивать вопросы')).not.toBeChecked();
  });

  it('disabled — переключатель недоступен, клик не вызывает onChange', async () => {
    const onChange = vi.fn();
    render(<Toggle label="Включён" checked={false} disabled onChange={onChange} />);

    expect(screen.getByLabelText('Включён')).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Включён'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('media — видна, но не попадает в доступное имя (её alt обычно повторяет label)', () => {
    render(
      <Toggle
        label="Вариант 2"
        checked={false}
        onChange={vi.fn()}
        media={<img src="/api/exam-images/i1" alt="Вариант 2" />}
      />,
    );

    // Картинка спрятана от дерева доступности (aria-hidden), но остаётся в DOM.
    expect(screen.getByAltText('Вариант 2')).toHaveAttribute(
      'src',
      '/api/exam-images/i1',
    );
    expect(screen.getByRole('checkbox', { name: 'Вариант 2' })).toBeInTheDocument();
  });
});
