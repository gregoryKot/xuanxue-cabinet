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

  // Проводка через RichText (ADR-0124) — образец теста из RichText.test.tsx.
  it('звёздочки в подсказке становятся <strong>', () => {
    render(
      <Toggle
        label="Перемешивать вопросы"
        hint="Действует **сразу** для новых попыток"
        checked={false}
        onChange={vi.fn()}
      />,
    );

    const strong = screen.getByText('сразу');
    expect(strong.tagName).toBe('STRONG');
  });

  it('disabled — переключатель недоступен, клик не вызывает onChange', async () => {
    const onChange = vi.fn();
    render(<Toggle label="Включён" checked={false} disabled onChange={onChange} />);

    expect(screen.getByLabelText('Включён')).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Включён'));

    expect(onChange).not.toHaveBeenCalled();
  });
});
