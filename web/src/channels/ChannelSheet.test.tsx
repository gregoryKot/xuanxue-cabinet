// ChannelSheet напрямую, с фейковыми onCreate/onUpdate/onRemove — по образцу
// schedule/ClassSheet.test.tsx.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelDto, CreateChannelInput, UpdateChannelInput } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { ChannelSheet } from './ChannelSheet';

function makeChannel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'ch1',
    type: 'vk',
    title: 'ВК школы',
    active: true,
    target: '777',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

interface RenderSheetOverrides {
  onCreate?: (input: CreateChannelInput) => Promise<void>;
  onUpdate?: (id: string, input: UpdateChannelInput) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
}

function renderSheet(
  channelDto: ChannelDto | null,
  overrides: RenderSheetOverrides = {},
) {
  const onClose = vi.fn();
  const onCreate = overrides.onCreate ?? vi.fn().mockResolvedValue(undefined);
  const onUpdate = overrides.onUpdate ?? vi.fn().mockResolvedValue(undefined);
  const onRemove = overrides.onRemove ?? vi.fn().mockResolvedValue(undefined);

  render(
    <MemoryRouter initialEntries={['/hub', '/channels']} initialIndex={1}>
      <ChannelSheet
        channelDto={channelDto}
        onClose={onClose}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
    </MemoryRouter>,
  );

  return { onClose, onCreate, onUpdate, onRemove };
}

describe('ChannelSheet — создание', () => {
  it('telegram — chatId уходит в config при сохранении', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderSheet(null);

    await user.selectOptions(screen.getByLabelText('Тип канала'), 'telegram');
    await user.type(screen.getByLabelText('Название'), 'Канал школы');
    await user.type(screen.getByLabelText('Адрес канала или группы'), '@school_channel');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        type: 'telegram',
        title: 'Канал школы',
        config: { chatId: '@school_channel' },
      }),
    );
  });

  it('vk (тип по умолчанию) — токен и ID беседы уходят в config', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderSheet(null);

    await user.type(screen.getByLabelText('Название'), 'ВК школы');
    await user.type(screen.getByLabelText('Токен сообщества'), 'secret');
    await user.type(screen.getByLabelText('ID беседы'), '42');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        type: 'vk',
        title: 'ВК школы',
        config: { token: 'secret', peerId: 42 },
      }),
    );
  });

  it('пустое название — ошибка, onCreate не вызывается', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderSheet(null);

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText(/название/)).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('vk — токен: type=password, автозаполнение выключено, подсказка где взять (ревью п.6)', () => {
    renderSheet(null);

    const token = screen.getByLabelText('Токен сообщества');
    expect(token).toHaveAttribute('type', 'password');
    expect(token).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByText(/Работа с API/)).toBeInTheDocument();
    expect(screen.getByText(/2000000000/)).toBeInTheDocument();
  });
});

describe('ChannelSheet — правка', () => {
  it('тип показан текстом, не select — редактирование не меняет тип', () => {
    renderSheet(makeChannel());
    expect(screen.getByText('Тип: ВК')).toBeInTheDocument();
    expect(screen.queryByLabelText('Тип канала')).not.toBeInTheDocument();
  });

  it('пустой токен ВК — config не отправляется', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeChannel());

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('ch1', { title: 'ВК школы' }),
    );
  });

  it('заполненный токен — config уходит целиком', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeChannel());

    await user.type(screen.getByLabelText('Токен сообщества'), 'newsecret');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('ch1', {
        title: 'ВК школы',
        config: { token: 'newsecret', peerId: 777 },
      }),
    );
  });

  it('ошибка сервера с details — список под формой', async () => {
    const user = userEvent.setup();
    const onUpdate = vi
      .fn()
      .mockRejectedValue(
        new ApiError('Проверьте поля.', 400, 'invalid_input', ['title: занято']),
      );
    renderSheet(makeChannel(), { onUpdate });

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Проверьте поля.');
    expect(alert).toHaveTextContent('title: занято');
  });
});

describe('ChannelSheet — удаление', () => {
  it('новый канал — кнопки «Удалить» нет', () => {
    renderSheet(null);
    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
  });

  it('подтверждение и успешное удаление закрывают весь лист ровно одним переходом назад (ревью п.5)', async () => {
    const user = userEvent.setup();
    const { onRemove, onClose } = renderSheet(makeChannel());

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(screen.getByRole('dialog', { name: 'Удалить канал?' })).toBeInTheDocument();

    await user.click(
      screen.getAllByRole('button', { name: 'Удалить' })[1] as HTMLElement,
    );

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('ch1'));
    // Один переход назад закрывает весь лист (не два navigate(-1) подряд —
    // ConfirmDialog делает свой единственный goBack(), закрытие всего листа —
    // отдельный эффект после этого), поэтому onClose вызывается ровно один раз.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    // ConfirmDialog закрылся сам (единственный goBack()) — на экране
    // остаётся только лист (onClose реальный ChannelsScreen размонтировал бы
    // и его, здесь onClose — спай без родителя, отвечающего за unmount).
    expect(
      screen.queryByRole('dialog', { name: 'Удалить канал?' }),
    ).not.toBeInTheDocument();
  });

  it('сбой при удалении — текст ошибки на листе, лист не закрывается', async () => {
    const user = userEvent.setup();
    const onRemove = vi
      .fn()
      .mockRejectedValue(new ApiError('Канал используется в рассылке.', 409, 'conflict'));
    const { onClose } = renderSheet(makeChannel(), { onRemove });

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    await user.click(
      screen.getAllByRole('button', { name: 'Удалить' })[1] as HTMLElement,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Канал используется в рассылке.',
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
