// Наведение по умолчанию выключено (setupTests.ts: matchMedia всегда
// matches: false) — это и есть тачскрин-режим, тесты клика/фокуса/Escape
// идут без стаба. Наведение проверяется одним тестом со своим стабом
// '(hover: hover)': matches true.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Field } from './Field';
import { InfoTip } from './InfoTip';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InfoTip', () => {
  it('кнопка подписана «Подсказка: <label>», текста подсказки в accessible name нет', () => {
    render(<InfoTip label="Уровень" text="Ученик увидит его в скобках." />);

    expect(
      screen.getByRole('button', { name: 'Подсказка: Уровень' }),
    ).toBeInTheDocument();
  });

  it('клик открывает подсказку, повторный клик закрывает', async () => {
    const user = userEvent.setup();
    render(<InfoTip label="Уровень" text="Ученик увидит его в скобках." />);
    const button = screen.getByRole('button', { name: 'Подсказка: Уровень' });

    await user.click(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Ученик увидит его в скобках.',
    );

    await user.click(button);
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('фокус с клавиатуры открывает, потеря фокуса закрывает', () => {
    render(<InfoTip label="Уровень" text="Текст подсказки" />);
    const button = screen.getByRole('button', { name: 'Подсказка: Уровень' });

    // fireEvent, не button.focus(): обновление состояния из «сырого» вызова
    // DOM мимо React не гарантированно попадает в тот же тик рендера.
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.blur(button);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('Escape закрывает открытую подсказку', async () => {
    const user = userEvent.setup();
    render(<InfoTip label="Уровень" text="Текст подсказки" />);

    await user.click(screen.getByRole('button', { name: 'Подсказка: Уровень' }));
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('клик мимо закрывает открытую подсказку', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <InfoTip label="Уровень" text="Текст подсказки" />
        <button>Где-то ещё</button>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Подсказка: Уровень' }));
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Где-то ещё' }));
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('устройство с наведением — мышь открывает и закрывает подсказку', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, media: '(hover: hover)' }),
    );
    render(<InfoTip label="Уровень" text="Текст подсказки" />);
    const button = screen.getByRole('button', { name: 'Подсказка: Уровень' });

    fireEvent.mouseEnter(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(button);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('matchMedia бросает — наведения нет, мышь подсказку не открывает', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => {
        throw new Error('нет matchMedia');
      }),
    );
    render(<InfoTip label="Уровень" text="Текст подсказки" />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Подсказка: Уровень' }));

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('кнопка у нижнего края экрана — подсказка встаёт над ней, у правого — прижата к краю', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('innerWidth', 360);
    vi.stubGlobal('innerHeight', 640);
    render(<InfoTip label="Уровень" text="Текст подсказки" />);
    const button = screen.getByRole('button', { name: 'Подсказка: Уровень' });
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      top: 600,
      bottom: 620,
      left: 340,
      right: 358,
      width: 18,
      height: 20,
      x: 340,
      y: 600,
      toJSON: () => ({}),
    });

    await user.click(button);

    const tooltip = await screen.findByRole('tooltip');
    // Над кнопкой: top меньше верхнего края кнопки; слева — не дальше, чем
    // позволяет ширина экрана минус ширина поповера.
    expect(parseFloat(tooltip.style.top)).toBeLessThan(600);
    expect(parseFloat(tooltip.style.left)).toBeLessThan(340);
  });

  it('другая клавиша (не Escape) подсказку не закрывает', () => {
    render(<InfoTip label="Уровень" text="Текст подсказки" />);
    const button = screen.getByRole('button', { name: 'Подсказка: Уровень' });

    fireEvent.focus(button);
    fireEvent.keyDown(button, { key: 'a' });

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('нажатие по самой кнопке не считается «кликом мимо»', () => {
    render(<InfoTip label="Уровень" text="Текст подсказки" />);
    const button = screen.getByRole('button', { name: 'Подсказка: Уровень' });

    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.pointerDown(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  // Field.tsx держит кнопку InfoTip внутри <label> (только SVG, без текста) —
  // текст подсказки не должен попасть в accessible name поля ни закрытым, ни
  // открытым (createPortal выносит его из дерева label целиком).
  it('внутри Field: getByLabelText находит поле и закрытым, и открытым тултипом', async () => {
    const user = userEvent.setup();
    render(
      <Field label="Уровень" tip="Ученик увидит его в скобках после названия.">
        <input defaultValue="первый год" />
      </Field>,
    );

    expect(screen.getByLabelText('Уровень')).toHaveValue('первый год');

    await user.click(screen.getByRole('button', { name: 'Подсказка: Уровень' }));
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByLabelText('Уровень')).toHaveValue('первый год');
  });
});
