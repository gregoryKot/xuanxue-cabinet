import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useDialog } from './useDialog';

function Dialog({ onClose, children }: { onClose: () => void; children?: ReactNode }) {
  const { headingRef, containerRef } = useDialog(onClose);
  return (
    <div
      // Колбэк вместо containerRef напрямую — див ждёт ref на HTMLDivElement,
      // useDialog отдаёт RefObject<HTMLElement | null> (M3), см. компоненты
      // диалогов; присваивание значения-подтипа не требует `as`-каста.
      ref={(node) => {
        containerRef.current = node;
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <h2 ref={headingRef} tabIndex={-1} id="dialog-title">
        Заголовок
      </h2>
      {children}
    </div>
  );
}

function Harness({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <button type="button">Открыть</button>
      <Dialog onClose={onClose} />
    </div>
  );
}

describe('useDialog', () => {
  it('фокусирует заголовок при монтировании', () => {
    render(<Harness onClose={vi.fn()} />);

    expect(screen.getByText('Заголовок')).toHaveFocus();
  });

  it('Esc вызывает onClose', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('блокирует прокрутку фона на время открытия и снимает при размонтировании', () => {
    const { unmount } = render(<Harness onClose={vi.fn()} />);

    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('два открытых диалога — Esc закрывает только верхний, не оба разом', () => {
    // ConfirmDialog поверх LessonSheet: оба useDialog слушают document
    // (ревью п.8) — без стека один Esc вызвал бы оба onClose.
    const onCloseOuter = vi.fn();
    const onCloseInner = vi.fn();
    render(
      <div>
        <Dialog onClose={onCloseOuter} />
        <Dialog onClose={onCloseInner} />
      </div>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCloseInner).toHaveBeenCalledTimes(1);
    expect(onCloseOuter).not.toHaveBeenCalled();
  });

  it('возвращает фокус на элемент, с которого лист открыли', async () => {
    const user = userEvent.setup();
    function Wrapper({ show }: { show: boolean }) {
      return (
        <div>
          <button type="button">Открыть</button>
          {show && <Dialog onClose={vi.fn()} />}
        </div>
      );
    }
    const { rerender } = render(<Wrapper show={false} />);
    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    rerender(<Wrapper show={true} />);
    expect(screen.getByText('Заголовок')).toHaveFocus();

    rerender(<Wrapper show={false} />);

    expect(screen.getByRole('button', { name: 'Открыть' })).toHaveFocus();
  });

  // M3 (docs/audits/2026-09-12-quality-audit.md): без ловушки Tab/Shift+Tab
  // с клавиатуры можно было уйти под оверлей — фокус утекал в фон страницы.
  it('Tab с последнего фокусируемого элемента диалога переносит фокус на первый', () => {
    render(
      <Dialog onClose={vi.fn()}>
        <button type="button">Первая</button>
        <button type="button">Последняя</button>
      </Dialog>,
    );
    screen.getByText('Последняя').focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(screen.getByText('Первая')).toHaveFocus();
  });

  it('Shift+Tab с первого фокусируемого элемента диалога переносит фокус на последний', () => {
    render(
      <Dialog onClose={vi.fn()}>
        <button type="button">Первая</button>
        <button type="button">Последняя</button>
      </Dialog>,
    );
    screen.getByText('Первая').focus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(screen.getByText('Последняя')).toHaveFocus();
  });

  it('вложенный диалог: Tab запирается у верхнего диалога стека, не у нижнего', () => {
    render(
      <div>
        <Dialog onClose={vi.fn()}>
          <button type="button">Внешняя кнопка</button>
        </Dialog>
        <Dialog onClose={vi.fn()}>
          <button type="button">Первая внутри</button>
          <button type="button">Последняя внутри</button>
        </Dialog>
      </div>,
    );
    screen.getByText('Последняя внутри').focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    // Цикл случился внутри верхнего (второго) диалога — не переход к кнопке
    // нижнего, у которого свой (незадействованный) обработчик Tab.
    expect(screen.getByText('Первая внутри')).toHaveFocus();
  });

  it('фон помечается inert, пока диалог открыт, и освобождается после закрытия', async () => {
    const user = userEvent.setup();
    function Wrapper({ show }: { show: boolean }) {
      return (
        <div>
          <button type="button">Открыть</button>
          {show && <Dialog onClose={vi.fn()} />}
        </div>
      );
    }
    const { rerender } = render(<Wrapper show={false} />);
    const trigger = screen.getByRole('button', { name: 'Открыть' });
    await user.click(trigger);
    rerender(<Wrapper show={true} />);

    expect(trigger.hasAttribute('inert')).toBe(true);

    rerender(<Wrapper show={false} />);

    expect(trigger.hasAttribute('inert')).toBe(false);
  });
  it('диалог без containerRef: Escape работает, фон не метится inert', async () => {
    // Потребитель может не навесить containerRef (лист без собственных
    // контролов) — ловушка Tab и inert тогда просто не включаются, а закрытие
    // по Escape и возврат фокуса остаются (M3 аудита).
    const user = userEvent.setup();
    const onClose = vi.fn();
    function BareDialog() {
      const { headingRef } = useDialog(onClose);
      return (
        <div role="dialog" aria-modal="true" aria-labelledby="bare-title">
          <h2 id="bare-title" ref={headingRef} tabIndex={-1}>
            Без контейнера
          </h2>
        </div>
      );
    }
    render(
      <div>
        <button type="button">Снаружи</button>
        <BareDialog />
      </div>,
    );

    expect(screen.getByRole('button', { name: 'Снаружи' }).hasAttribute('inert')).toBe(
      false,
    );

    await user.keyboard('{Tab}');
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
