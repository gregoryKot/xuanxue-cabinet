// AttemptMediaLinkForm напрямую (тот же приём, что RecordingSection.test.tsx
// и GradingForm.test.tsx) — onSubmit мокается пропом, сеть здесь не при чём.
// Кнопки «Сохранить ссылку» больше нет (ADR-0136): проверяем автосохранение
// на вставке ссылки, на уходе с поля и защиту от двойной отправки.
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
  it('вставка ссылки в пустое поле сохраняет её сама, без отдельной кнопки', async () => {
    const { onSubmit } = renderForm();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Ссылка на видео'));
    await user.paste('https://example.com/v');

    expect(onSubmit).toHaveBeenCalledWith('https://example.com/v');
    expect(await screen.findByLabelText('Ссылка на видео')).toHaveValue('');
  });

  it('уход с поля с текстом сохраняет ссылку', async () => {
    const { onSubmit } = renderForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Ссылка на видео'), 'https://example.com/v');
    await user.tab();

    expect(onSubmit).toHaveBeenCalledWith('https://example.com/v');
  });

  it('уход с пустого поля ничего не отправляет', async () => {
    const { onSubmit } = renderForm();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Ссылка на видео'));
    await user.tab();

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Enter в поле тоже сохраняет ссылку — форма отправляется неявно', async () => {
    const { onSubmit } = renderForm();
    const user = userEvent.setup();

    await user.type(
      screen.getByLabelText('Ссылка на видео'),
      'https://example.com/v{Enter}',
    );

    expect(onSubmit).toHaveBeenCalledWith('https://example.com/v');
  });

  it('pending — уход с поля не шлёт вторую копию той же ссылки', async () => {
    const { onSubmit } = renderForm({ pending: true });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Ссылка на видео'), 'https://example.com/v');
    await user.tab();

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('pending — под полем видна тихая строка «Сохраняем ссылку…»', () => {
    renderForm({ pending: true });

    expect(screen.getByRole('status')).toHaveTextContent('Сохраняем ссылку…');
  });

  it('не pending — строки «Сохраняем ссылку…» нет', () => {
    renderForm();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('успех — поле очищается', async () => {
    const { onSubmit } = renderForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Ссылка на видео'), 'https://example.com/v');
    await user.tab();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText('Ссылка на видео')).toHaveValue('');
  });

  it('сбой — поле не очищается, ошибка сервера видна', async () => {
    const user = userEvent.setup();
    renderForm({
      onSubmit: vi.fn().mockResolvedValue(false),
      error: { message: 'Это не похоже на ссылку на видео.' },
    });

    await user.type(screen.getByLabelText('Ссылка на видео'), 'не-ссылка');
    await user.tab();

    expect(
      await screen.findByText('Это не похоже на ссылку на видео.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Ссылка на видео')).toHaveValue('не-ссылка');
  });

  it('disabled — поле выключено (предпросмотр «глазами ученика»)', () => {
    renderForm({ disabled: true });

    expect(screen.getByLabelText('Ссылка на видео')).toBeDisabled();
  });
});
