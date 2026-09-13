// AttemptMediaLinkForm напрямую (тот же приём, что RecordingSection.test.tsx
// и GradingForm.test.tsx) — onSubmit мокается пропом, сеть здесь не при чём.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AttemptMediaLinkForm } from './AttemptMediaLinkForm';

function renderForm(overrides: Partial<Parameters<typeof AttemptMediaLinkForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(true);
  render(
    <AttemptMediaLinkForm
      onSubmit={onSubmit}
      pending={false}
      error={null}
      {...overrides}
    />,
  );
  return { onSubmit };
}

describe('AttemptMediaLinkForm', () => {
  it('пустое поле — кнопка недоступна, onSubmit не звался', () => {
    const { onSubmit } = renderForm();

    expect(screen.getByRole('button', { name: 'Сохранить ссылку' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('успех — onSubmit с текстом ссылки, поле очищается', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText('Ссылка на видео'), 'https://example.com/v');
    await user.click(screen.getByRole('button', { name: 'Сохранить ссылку' }));

    expect(onSubmit).toHaveBeenCalledWith('https://example.com/v');
    expect(await screen.findByLabelText('Ссылка на видео')).toHaveValue('');
  });

  it('сбой — поле не очищается, ошибка сервера видна', async () => {
    const user = userEvent.setup();
    renderForm({
      onSubmit: vi.fn().mockResolvedValue(false),
      error: { message: 'Это не похоже на ссылку на видео.' },
    });

    await user.type(screen.getByLabelText('Ссылка на видео'), 'не-ссылка');
    await user.click(screen.getByRole('button', { name: 'Сохранить ссылку' }));

    expect(
      await screen.findByText('Это не похоже на ссылку на видео.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Ссылка на видео')).toHaveValue('не-ссылка');
  });

  it('pending — кнопка занята', () => {
    renderForm({ pending: true });

    expect(screen.getByRole('button', { name: 'Сохранить ссылку' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
});
