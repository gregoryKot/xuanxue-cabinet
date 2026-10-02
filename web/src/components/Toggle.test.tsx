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

  // InfoTip (ADR-0139) — кнопка стоит рядом с <label>, не внутри: клик по ней
  // не должен переключать чекбокс (Toggle.tsx, комментарий у wrapperStyle).
  it('tip — кнопка подсказки не переключает чекбокс', async () => {
    const onChange = vi.fn();
    render(
      <Toggle
        label="Перемешивать вопросы"
        tip="У каждого ученика свой порядок"
        checked={false}
        onChange={onChange}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Подсказка: Перемешивать вопросы' }),
    );

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'У каждого ученика свой порядок',
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disabled — переключатель недоступен, клик не вызывает onChange', async () => {
    const onChange = vi.fn();
    render(<Toggle label="Включён" checked={false} disabled onChange={onChange} />);

    expect(screen.getByLabelText('Включён')).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Включён'));

    expect(onChange).not.toHaveBeenCalled();
  });
});

// Показ без права ответить (предпросмотр «глазами ученика») не приглушается:
// серая вуаль исказила бы вид строки (отзыв владельца 2026-10-02), а `disabled`
// — «запрос в пути» — по-прежнему приглушает (ChannelCard).
describe('Toggle — readOnly и disabled', () => {
  function labelOf(name: string): HTMLElement {
    const label = screen.getByLabelText(name).closest('label');
    if (!label) throw new Error('у переключателя нет <label>');
    return label;
  }

  it('readOnly — переключатель выключен, строка не приглушена', async () => {
    const onChange = vi.fn();
    render(<Toggle label="24" checked={false} readOnly onChange={onChange} />);

    expect(screen.getByLabelText('24')).toBeDisabled();
    expect(['', '1']).toContain(labelOf('24').style.opacity);
    expect(labelOf('24').style.cursor).toBe('default');
    await userEvent.click(screen.getByLabelText('24'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disabled — строка по-прежнему приглушена', () => {
    render(<Toggle label="Включён" checked={false} disabled onChange={vi.fn()} />);

    expect(labelOf('Включён').style.opacity).toBe('0.6');
  });
});
