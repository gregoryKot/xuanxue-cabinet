// Смахнуть/«Убрать» строки списка (просьба владельца 2026-09-22) — кнопка
// всегда в DOM, достижима с клавиатуры, жест лишь ускоряет доступ к ней
// (CLAUDE.md «Доступность»). Пороги и арифметика жеста — useSwipeRow.test.ts,
// здесь только разметка, события и то, что видит пользователь.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SWIPE_BUTTON_WIDTH } from './useSwipeRow';
import { SwipeRow } from './SwipeRow';

const CONTENT_TEXT = 'Содержимое строки';
const DISMISS_LABEL = 'Убрать уведомление: тест';

function renderRow(overrides: { onDismiss?: () => void; disabled?: boolean } = {}) {
  const onDismiss = overrides.onDismiss ?? vi.fn();
  render(
    <ul>
      <SwipeRow
        onDismiss={onDismiss}
        dismissLabel={DISMISS_LABEL}
        disabled={overrides.disabled}
      >
        <span>{CONTENT_TEXT}</span>
      </SwipeRow>
    </ul>,
  );
  return { onDismiss };
}

/** Слой содержимого — прямой родитель children в разметке SwipeRow.tsx; на
 * нём же висят обработчики жеста и transform, который двигает всю строку. */
function contentLayer(): HTMLElement {
  return screen.getByText(CONTENT_TEXT).parentElement as HTMLElement;
}

describe('SwipeRow — кнопка «Убрать»', () => {
  it('есть в DOM с самого начала, достижима с клавиатуры, клик зовёт onDismiss', async () => {
    const user = userEvent.setup();
    const { onDismiss } = renderRow();

    const button = screen.getByRole('button', { name: DISMISS_LABEL });
    await user.tab();
    expect(button).toHaveFocus();

    await user.click(button);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('фокус на кнопке открывает строку без жеста', async () => {
    const user = userEvent.setup();
    renderRow();

    expect(contentLayer().style.transform).toBe('translateX(-0px)');

    await user.tab();
    expect(contentLayer().style.transform).toBe(`translateX(-${SWIPE_BUTTON_WIDTH}px)`);
  });
});

describe('SwipeRow — жест', () => {
  it('смахивание дальше половины ширины кнопки открывает строку', () => {
    renderRow();
    const layer = contentLayer();

    fireEvent.touchStart(layer, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchMove(layer, {
      touches: [{ clientX: 300 - SWIPE_BUTTON_WIDTH, clientY: 100 }],
    });
    fireEvent.touchEnd(layer);

    expect(layer.style.transform).toBe(`translateX(-${SWIPE_BUTTON_WIDTH}px)`);
  });

  it('вертикальный жест строку не сдвигает — прокрутке страницы не мешаем', () => {
    renderRow();
    const layer = contentLayer();

    fireEvent.touchStart(layer, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(layer, { touches: [{ clientX: 110, clientY: 200 }] });
    fireEvent.touchEnd(layer);

    expect(layer.style.transform).toBe('translateX(-0px)');
  });

  it('нажатие по содержимому, пока строка открыта, закрывает её, а не переходит по ссылке', () => {
    const onDismiss = vi.fn();
    renderRow({ onDismiss });
    const layer = contentLayer();

    fireEvent.touchStart(layer, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchMove(layer, {
      touches: [{ clientX: 300 - SWIPE_BUTTON_WIDTH, clientY: 100 }],
    });
    fireEvent.touchEnd(layer);
    expect(layer.style.transform).toBe(`translateX(-${SWIPE_BUTTON_WIDTH}px)`);

    fireEvent.click(layer);

    expect(layer.style.transform).toBe('translateX(-0px)');
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('SwipeRow — строка остаётся обычной строкой', () => {
  // Обёртка перехватывает нажатие в фазе погружения (SwipeRow.tsx,
  // handleContentClick) — пока строка закрыта, перехват обязан пропускать
  // нажатие дальше: иначе ссылка уведомления перестала бы открываться, и
  // жест сломал бы то, ради чего лента и существует.
  it('закрытая строка пропускает нажатие к содержимому', async () => {
    const user = userEvent.setup();
    const onContentClick = vi.fn();
    render(
      <ul>
        <SwipeRow onDismiss={vi.fn()} dismissLabel={DISMISS_LABEL}>
          <button type="button" onClick={onContentClick}>
            {CONTENT_TEXT}
          </button>
        </SwipeRow>
      </ul>,
    );

    await user.click(screen.getByRole('button', { name: CONTENT_TEXT }));

    expect(onContentClick).toHaveBeenCalledTimes(1);
  });

  // Линию снизу рисует строка, кроме последней в карточке — как было у
  // собственного `<li>` NotificationRow.tsx до переезда на SwipeRow
  // (ADR-0088: промежуток и линии списка задаёт контейнер, а не строка).
  it('последняя строка карточки не красит линию снизу', () => {
    render(
      <ul>
        <SwipeRow onDismiss={vi.fn()} dismissLabel={DISMISS_LABEL} isLast>
          <span>{CONTENT_TEXT}</span>
        </SwipeRow>
      </ul>,
    );

    const row = screen.getByText(CONTENT_TEXT).closest('li') as HTMLElement;
    expect(row.style.borderBottom).toBe('');
  });
});

describe('SwipeRow — disabled', () => {
  it('кнопка недоступна для нажатия на время запроса', () => {
    renderRow({ disabled: true });

    expect(screen.getByRole('button', { name: DISMISS_LABEL })).toBeDisabled();
  });
});
