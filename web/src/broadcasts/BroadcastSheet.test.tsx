// BroadcastSheet напрямую, с фейковым onCreate — по образцу
// planning/LessonSheet.test.tsx.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelDto, CreateBroadcastInput } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { BroadcastSheet } from './BroadcastSheet';

function makeChannel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'ch1',
    type: 'vk',
    title: 'ВК школы',
    active: true,
    target: '1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderSheet(
  channels: ChannelDto[] = [makeChannel()],
  onCreate: (input: CreateBroadcastInput) => Promise<void> = vi
    .fn()
    .mockResolvedValue(undefined),
) {
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={['/hub', '/broadcasts']} initialIndex={1}>
      <BroadcastSheet channels={channels} onClose={onClose} onCreate={onCreate} />
    </MemoryRouter>,
  );
  return { onClose, onCreate };
}

describe('BroadcastSheet', () => {
  it('текст + канал + «сейчас» — POST с телом без scheduledAt', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    renderSheet([makeChannel()], onCreate);

    await user.type(screen.getByLabelText('Текст'), 'Через 30 минут занятие');
    await user.click(screen.getByLabelText('ВК · ВК школы'));
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        text: 'Через 30 минут занятие',
        channelIds: ['ch1'],
        idempotencyKey: expect.any(String) as string,
      }),
    );
  });

  it('отключённый выбор «сейчас» — время отправки в теле', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn<(input: CreateBroadcastInput) => Promise<void>>();
    onCreate.mockResolvedValue(undefined);
    renderSheet([makeChannel()], onCreate);

    await user.type(screen.getByLabelText('Текст'), 'Текст');
    await user.click(screen.getByLabelText('ВК · ВК школы'));
    await user.click(screen.getByLabelText('Отправить сейчас'));
    await user.type(screen.getByLabelText('Время отправки'), '2026-09-08T19:00');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    const input = onCreate.mock.calls[0]?.[0];
    expect(input?.scheduledAt).toMatch(/Z$/);
  });

  it('предпросмотр показывает текст как есть', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.type(screen.getByLabelText('Текст'), 'Текст поста');

    expect(screen.getByText('Текст поста', { selector: 'pre' })).toBeInTheDocument();
  });

  it('пустой текст — ошибка, onCreate не вызывается', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    renderSheet([makeChannel()], onCreate);

    await user.click(screen.getByLabelText('ВК · ВК школы'));
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByText(/текст/)).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('пустой текст — фокус уходит на textarea (pr-k3-fixes.md п.6)', async () => {
    const user = userEvent.setup();
    renderSheet([makeChannel()]);

    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByLabelText('Текст')).toHaveFocus();
  });

  it('текст есть, канал не выбран — фокус уходит на список каналов', async () => {
    const user = userEvent.setup();
    renderSheet([makeChannel()]);

    await user.type(screen.getByLabelText('Текст'), 'Текст');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByRole('group', { name: 'Каналы' })).toHaveFocus();
  });

  it('время отправки не указано — фокус уходит на поле времени', async () => {
    const user = userEvent.setup();
    renderSheet([makeChannel()]);

    await user.type(screen.getByLabelText('Текст'), 'Текст');
    await user.click(screen.getByLabelText('ВК · ВК школы'));
    await user.click(screen.getByLabelText('Отправить сейчас'));
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByLabelText('Время отправки')).toHaveFocus();
  });

  it('без каналов — честное сообщение вместо списка чекбоксов', () => {
    renderSheet([]);
    expect(screen.getByText(/Нет ни одного включённого канала/)).toBeInTheDocument();
  });

  it('ошибка сервера с details — список под формой', async () => {
    const user = userEvent.setup();
    const onCreate = vi
      .fn()
      .mockRejectedValue(
        new ApiError('Проверьте поля.', 400, 'invalid_input', ['channelIds: выключен']),
      );
    renderSheet([makeChannel()], onCreate);

    await user.type(screen.getByLabelText('Текст'), 'Текст');
    await user.click(screen.getByLabelText('ВК · ВК школы'));
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Проверьте поля.');
    expect(alert).toHaveTextContent('channelIds: выключен');
  });
});
