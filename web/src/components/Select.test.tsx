// Свой select кабинета существует из-за снимка владельца 2026-09-21 (экран
// «Рассылки»): «стрелочка у 2 недель как-то некрасиво прижата» — системную
// стрелку браузер рисует не в палитре кабинета и прижимает к самому краю
// поля. Здесь — только механика обёртки: сама верстка значка проверяется
// глазами (docs/adr/0043), а не тестом.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './Select';

describe('Select', () => {
  it('выбор значения — onChange получает новое value', async () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="Период" defaultValue="2" onChange={onChange}>
        <option value="2">2 недели</option>
        <option value="8">8 недель</option>
      </Select>,
    );

    await userEvent.selectOptions(screen.getByLabelText('Период'), '8');

    expect(onChange).toHaveBeenCalledTimes(1);
    const event = onChange.mock.calls[0]?.[0] as { target: { value: string } };
    expect(event.target.value).toBe('8');
  });

  it('значок — pointerEvents: none, иначе клик по нему не открывал бы список', () => {
    const { container } = render(
      <Select aria-label="Период" defaultValue="2" onChange={vi.fn()}>
        <option value="2">2 недели</option>
      </Select>,
    );

    const arrow = container.querySelector('svg');
    expect(arrow).toHaveStyle({ pointerEvents: 'none' });
  });

  it('aria-label достаётся самому select, а не обёртке', () => {
    render(
      <Select aria-label="Период" defaultValue="2" onChange={vi.fn()}>
        <option value="2">2 недели</option>
      </Select>,
    );

    const select = screen.getByRole('combobox', { name: 'Период' });
    expect(select.tagName).toBe('SELECT');
    expect(select.parentElement).not.toHaveAttribute('aria-label');
  });
});
