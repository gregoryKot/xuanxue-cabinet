import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useDialog } from './useDialog';

function Dialog({ onClose }: { onClose: () => void }) {
  const { headingRef } = useDialog(onClose);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <h2 ref={headingRef} tabIndex={-1} id="dialog-title">
        Заголовок
      </h2>
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
});
