// SendNowButton напрямую — по образцу broadcasts/BroadcastCard.test.tsx
// (та же механика подтверждения, ConfirmDialog).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import { SendNowButton } from './SendNowButton';

function renderButton(onSendNow = vi.fn().mockResolvedValue(undefined)) {
  render(
    <MemoryRouter initialEntries={['/hub', '/planning']} initialIndex={1}>
      <SendNowButton lessonId="l1" onSendNow={onSendNow} />
    </MemoryRouter>,
  );
  return { onSendNow };
}

describe('SendNowButton', () => {
  it('подтверждение и успех — зовёт onSendNow с id, показывает подпись успеха', async () => {
    const user = userEvent.setup();
    const { onSendNow } = renderButton();

    await user.click(screen.getByRole('button', { name: 'Отправить ссылку сейчас' }));
    expect(
      screen.getByRole('dialog', { name: 'Отправить ссылку сейчас?' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Отправить сейчас' }));

    expect(onSendNow).toHaveBeenCalledWith('l1');
    expect(
      await screen.findByText('Ссылка уйдёт в ближайшую минуту'),
    ).toBeInTheDocument();
  });

  it('сбой — текст ошибки сервера виден под кнопкой', async () => {
    const user = userEvent.setup();
    const onSendNow = vi
      .fn()
      .mockRejectedValue(new ApiError('У занятия нет ссылки.', 400, 'invalid_input'));
    renderButton(onSendNow);

    await user.click(screen.getByRole('button', { name: 'Отправить ссылку сейчас' }));
    await user.click(screen.getByRole('button', { name: 'Отправить сейчас' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('У занятия нет ссылки.');
    expect(screen.queryByText('Ссылка уйдёт в ближайшую минуту')).not.toBeInTheDocument();
  });

  it('«Отмена» закрывает диалог без вызова onSendNow', async () => {
    const user = userEvent.setup();
    const { onSendNow } = renderButton();

    await user.click(screen.getByRole('button', { name: 'Отправить ссылку сейчас' }));
    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(
      screen.queryByRole('dialog', { name: 'Отправить ссылку сейчас?' }),
    ).not.toBeInTheDocument();
    expect(onSendNow).not.toHaveBeenCalled();
  });
});
