import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(onConfirm = vi.fn(), onCancel = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/hub', '/target']} initialIndex={1}>
      <ConfirmDialog
        title="Отменить занятие?"
        message="Ученики больше не получат ссылку на это занятие."
        confirmLabel="Отменить занятие"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </MemoryRouter>,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('заголовок, текст и кнопки — доступный диалог', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Отменить занятие?' })).toBeInTheDocument();
    expect(
      screen.getByText('Ученики больше не получат ссылку на это занятие.'),
    ).toBeInTheDocument();
  });

  it('«Отменить занятие» вызывает onConfirm, затем закрывает диалог (onCancel)', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Отменить занятие' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    // handleConfirm — async (не await'ится самим обработчиком клика), goBack()
    // после него уходит отдельным микротаском — под нагрузкой полного прогона
    // (много файлов параллельно) он не всегда успевает до конца user.click(),
    // мигал в CI (CLAUDE.md «Детерминизм»: мигающий тест чинится в тот же день).
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });

  it('дожидается асинхронного onConfirm перед закрытием', async () => {
    const user = userEvent.setup();
    let resolveConfirm: (() => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    const { onCancel } = renderDialog(onConfirm);

    await user.click(screen.getByRole('button', { name: 'Отменить занятие' }));
    expect(onCancel).not.toHaveBeenCalled();

    resolveConfirm?.();
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });

  it('«Отмена» закрывает диалог через историю (onCancel)', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // Проводка через RichText (ADR-0124) — образец теста из RichText.test.tsx.
  it('звёздочки в тексте подтверждения становятся <strong>', () => {
    render(
      <MemoryRouter initialEntries={['/hub', '/target']} initialIndex={1}>
        <ConfirmDialog
          title="Отменить занятие?"
          message="Ссылка **на занятие** перестанет работать."
          confirmLabel="Отменить занятие"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>,
    );

    const strong = screen.getByText('на занятие');
    expect(strong.tagName).toBe('STRONG');
  });

  it('pending — кнопка подтверждения занята', () => {
    render(
      <MemoryRouter initialEntries={['/hub', '/target']} initialIndex={1}>
        <ConfirmDialog
          title="Удалить канал?"
          message="Действие необратимо."
          confirmLabel="Удалить"
          pending
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Удалить' })).toBeDisabled();
  });
});

// Переезд на «Тёплую школу» (ADR-0043): диалог поверх затемнения — белая
// карточка с мягкой тенью и радиусом блока. jsdom не вычисляет `var(--…)` —
// сравниваем ровно строку инлайн-стиля, не вычисленный цвет; у cssstyle
// сокращённое `style.borderBottom` для снятой границы отдаёт 'medium',
// поэтому спрашиваем borderBottomStyle.
describe('ConfirmDialog — облик (ADR-0043)', () => {
  it('карточка диалога — var(--card) с радиусом блока, без границы', () => {
    renderDialog();

    const cards = Array.from(
      screen.getByRole('dialog').querySelectorAll<HTMLElement>('div'),
    ).filter((el) => el.style.background === 'var(--card)');
    expect(cards).toHaveLength(1);
    const [card] = cards;
    expect(card?.style.borderRadius).toBe('var(--radius-block)');
    expect(card?.style.boxShadow).toBe('var(--shadow-card)');
    expect(card?.style.borderBottomStyle).toBe('');
  });
});
