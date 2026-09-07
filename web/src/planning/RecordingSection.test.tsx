// RecordingSection напрямую — вынесено из LessonSheet.test.tsx (ревью п.17:
// файл LessonSheet.test.tsx рос за 300 строк, «запись» — самостоятельная
// секция, не завязанная на диалог занятия).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AddRecordingInput } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { RecordingSection } from './RecordingSection';

function renderSection(
  recordings: Parameters<typeof RecordingSection>[0]['recordings'] = [],
  onAdd: (lessonId: string, input: AddRecordingInput) => Promise<void> = vi
    .fn()
    .mockResolvedValue(undefined),
) {
  render(<RecordingSection lessonId="l1" recordings={recordings} onAdd={onAdd} />);
  return { onAdd };
}

describe('RecordingSection — список записей', () => {
  it('запись со ссылкой — ссылка кликабельна', () => {
    renderSection([{ id: 'r1', title: 'Часть 1', url: 'https://youtu.be/1' }]);
    expect(screen.getByRole('link', { name: 'Часть 1' })).toHaveAttribute(
      'href',
      'https://youtu.be/1',
    );
  });

  it('запись без ссылки (видео из Telegram) — название без ссылки', () => {
    renderSection([{ id: 'r1', title: 'Видео в чате' }]);
    expect(screen.getByText('Видео в чате')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Видео в чате' })).not.toBeInTheDocument();
  });

  it('запись без названия — подпись «Запись» по умолчанию', () => {
    renderSection([{ id: 'r1', title: '', url: 'https://youtu.be/1' }]);
    expect(screen.getByRole('link', { name: 'Запись' })).toBeInTheDocument();
  });
});

describe('RecordingSection — форма добавления', () => {
  it('добавление ссылки шлёт onAdd, поле «Ссылка на запись»', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderSection();

    await user.type(screen.getByLabelText('Ссылка на запись'), 'https://youtu.be/2');
    await user.click(screen.getByRole('button', { name: 'Добавить запись' }));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith('l1', {
        title: undefined,
        url: 'https://youtu.be/2',
      }),
    );
  });

  it('название записи (необязательное) уходит в onAdd вместе со ссылкой', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderSection();

    await user.type(screen.getByLabelText('Название записи'), 'Часть 2');
    await user.type(screen.getByLabelText('Ссылка на запись'), 'https://youtu.be/2');
    await user.click(screen.getByRole('button', { name: 'Добавить запись' }));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith('l1', {
        title: 'Часть 2',
        url: 'https://youtu.be/2',
      }),
    );
  });

  it('пустая ссылка — клиентская ошибка на поле «Ссылка на запись», onAdd не вызывается', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderSection();

    await user.click(screen.getByRole('button', { name: 'Добавить запись' }));

    const error = await screen.findByText('Укажите ссылку на запись.');
    expect(error).toBeInTheDocument();
    // Ошибка формы — на поле «Ссылка на запись» (ревью п.7), не «Название записи».
    expect(
      screen.getByLabelText('Ссылка на запись').closest('label')?.parentElement,
    ).toContainElement(error);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('сбой на сервере при добавлении записи — текст ошибки под формой', async () => {
    const user = userEvent.setup();
    const onAdd = vi
      .fn()
      .mockRejectedValue(new ApiError('Ссылка уже добавлена.', 409, 'conflict'));
    renderSection([], onAdd);

    await user.type(screen.getByLabelText('Ссылка на запись'), 'https://youtu.be/2');
    await user.click(screen.getByRole('button', { name: 'Добавить запись' }));

    expect(await screen.findByText('Ссылка уже добавлена.')).toBeInTheDocument();
  });

  it('не-ApiError сбой при добавлении записи — общий текст', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockRejectedValue(new Error('boom'));
    renderSection([], onAdd);

    await user.type(screen.getByLabelText('Ссылка на запись'), 'https://youtu.be/2');
    await user.click(screen.getByRole('button', { name: 'Добавить запись' }));

    expect(
      await screen.findByText('Не удалось добавить запись. Попробуйте ещё раз.'),
    ).toBeInTheDocument();
  });
});
