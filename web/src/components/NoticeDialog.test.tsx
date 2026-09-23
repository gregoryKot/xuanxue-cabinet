// Попап с одной кнопкой — доступность и закрытие делит с ConfirmDialog.tsx
// через DialogShell.tsx (её тест уже проверяет оверлей и карточку целиком,
// здесь — то, что своё у NoticeDialog: одна кнопка вместо двух).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { NoticeDialog } from './NoticeDialog';

function renderNotice(onClose = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/hub', '/target']} initialIndex={1}>
      <NoticeDialog title="Время вышло" message="Попытка закрыта." onClose={onClose} />
    </MemoryRouter>,
  );
  return { onClose };
}

describe('NoticeDialog', () => {
  it('заголовок и текст видны, фокус уходит на заголовок', () => {
    renderNotice();

    expect(screen.getByRole('dialog', { name: 'Время вышло' })).toBeInTheDocument();
    expect(screen.getByText('Попытка закрыта.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Время вышло' })).toHaveFocus();
  });

  it('кнопка по умолчанию — «Закрыть», закрывает диалог', async () => {
    const user = userEvent.setup();
    const { onClose } = renderNotice();

    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('свой текст кнопки вместо умолчания', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MemoryRouter initialEntries={['/hub', '/target']} initialIndex={1}>
        <NoticeDialog
          title="Готово"
          message="Сохранено."
          closeLabel="Закрыть"
          onClose={onClose}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  // Проводка через RichText (ADR-0124) — образец теста из RichText.test.tsx.
  it('звёздочки в тексте попапа становятся <strong>', () => {
    render(
      <MemoryRouter initialEntries={['/hub', '/target']} initialIndex={1}>
        <NoticeDialog
          title="Время вышло"
          message="Попытка закрыта через **60 минут**."
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    const strong = screen.getByText('60 минут');
    expect(strong.tagName).toBe('STRONG');
  });

  it('Esc закрывает диалог тем же путём', async () => {
    const user = userEvent.setup();
    const { onClose } = renderNotice();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
