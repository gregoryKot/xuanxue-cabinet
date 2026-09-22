// Страница канала целиком: загрузка, поля, сохранение, удаление и проверка
// канала (ADR-0033). Мок сети — по префиксу пути (test-support/apiFetchMock.ts);
// `/channels/ch1/test` стоит раньше `/channels/ch1`, mockApiByPath матчит
// первым подходящим префиксом.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import ChannelEditorScreen from './ChannelEditorScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const LIST_MARKER = 'Здесь список каналов';

function makeChannel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'ch1',
    type: 'vk',
    title: 'ВК школы',
    active: true,
    target: '777',
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/channels" element={<p>{LIST_MARKER}</p>} />
        <Route path="/channels/new" element={<ChannelEditorScreen />} />
        <Route path="/channels/:channelId" element={<ChannelEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockChannel(channel: ChannelDto) {
  mockApiByPath({ '/channels/ch1': channel, '/channels': channel });
}

/** Канал уже пришёл с сервера — единственный запрос монтирования позади, и
 * отказ, поставленный следующим, достанется сохранению, а не загрузке. */
async function waitForMounted() {
  await screen.findByLabelText('Название');
}

function callsWithMethod(method: string) {
  return mockedApiFetch.mock.calls.filter(
    (call) => (call[1] as { method?: string } | undefined)?.method === method,
  );
}

describe('ChannelEditorScreen — загрузка', () => {
  it('канал ещё грузится — скелетон, а не пустой экран', () => {
    mockApiByPath({ '/channels/ch1': new Promise(() => {}) });

    const { container } = renderAt('/channels/ch1');

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('сбой загрузки — текст ошибки и повтор', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({ '/channels/ch1': new ApiError('Сервис недоступен', 503, 'unknown') });

    renderAt('/channels/ch1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockChannel(makeChannel());
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByRole('heading', { name: 'ВК школы' })).toBeVisible();
  });

  it('/channels/new — заголовок «Новый канал», запроса за каналом нет', async () => {
    mockApiByPath({ '/channels': makeChannel() });

    renderAt('/channels/new');

    expect(
      await screen.findByRole('heading', { name: 'Новый канал' }),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('«К списку каналов» — ссылка наверху страницы', async () => {
    const user = userEvent.setup();
    mockChannel(makeChannel());

    renderAt('/channels/ch1');
    await user.click(await screen.findByRole('link', { name: 'К списку каналов' }));

    expect(screen.getByText(LIST_MARKER)).toBeInTheDocument();
  });
});

describe('ChannelEditorScreen — создание', () => {
  it('telegram — адрес уходит в config, страница возвращается к списку', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/channels': makeChannel() });

    renderAt('/channels/new');
    await user.selectOptions(await screen.findByLabelText('Тип канала'), 'telegram');
    await user.type(screen.getByLabelText('Название'), 'Канал школы');
    await user.type(screen.getByLabelText('Адрес канала или группы'), '@school_channel');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('POST')).toHaveLength(1));
    const body = callsWithMethod('POST')[0]?.[1] as { body: unknown };
    expect(body.body).toEqual({
      type: 'telegram',
      title: 'Канал школы',
      config: { chatId: '@school_channel' },
      tags: [],
    });
    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
  });

  it('vk (тип по умолчанию) — токен и ID беседы уходят в config', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/channels': makeChannel() });

    renderAt('/channels/new');
    await user.type(await screen.findByLabelText('Название'), 'ВК школы');
    await user.type(screen.getByLabelText('Токен сообщества'), 'secret');
    await user.type(screen.getByLabelText('ID беседы'), '42');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('POST')).toHaveLength(1));
    const body = callsWithMethod('POST')[0]?.[1] as { body: unknown };
    expect(body.body).toEqual({
      type: 'vk',
      title: 'ВК школы',
      config: { token: 'secret', peerId: 42 },
      tags: [],
    });
  });

  it('теги — набранное через запятую уходит массивом в тело запроса (ADR-0108)', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/channels': makeChannel() });

    renderAt('/channels/new');
    await user.type(await screen.findByLabelText('Название'), 'ВК школы');
    await user.type(screen.getByLabelText('Токен сообщества'), 'secret');
    await user.type(screen.getByLabelText('ID беседы'), '42');
    await user.type(screen.getByLabelText('Теги'), 'новички, средние');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('POST')).toHaveLength(1));
    const body = callsWithMethod('POST')[0]?.[1] as { body: { tags: string[] } };
    expect(body.body.tags).toEqual(['новички', 'средние']);
  });

  it('пустое название — ошибка формы, запроса нет', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/channels': makeChannel() });

    renderAt('/channels/new');
    await user.click(await screen.findByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('название');
    expect(callsWithMethod('POST')).toHaveLength(0);
  });

  it('новый канал — ни выключателя, ни удаления, ни проверки', async () => {
    mockApiByPath({ '/channels': makeChannel() });

    renderAt('/channels/new');
    await waitForMounted();

    expect(screen.queryByLabelText('Включён')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Удалить канал' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Проверка')).not.toBeInTheDocument();
  });

  it('vk — токен: type=password, автозаполнение выключено, подсказка где взять (ревью п.6)', async () => {
    mockApiByPath({ '/channels': makeChannel() });

    renderAt('/channels/new');

    const token = await screen.findByLabelText('Токен сообщества');
    expect(token).toHaveAttribute('type', 'password');
    expect(token).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByText(/Работа с API/)).toBeInTheDocument();
    expect(screen.getByText(/2000000000/)).toBeInTheDocument();
  });
});

describe('ChannelEditorScreen — правка', () => {
  it('тип показан текстом, не select — правка не меняет тип', async () => {
    mockChannel(makeChannel());

    renderAt('/channels/ch1');

    expect(await screen.findByText('Тип: ВК')).toBeInTheDocument();
    expect(screen.queryByLabelText('Тип канала')).not.toBeInTheDocument();
  });

  it('пустой токен ВК — config не отправляется, `active` уходит как есть', async () => {
    const user = userEvent.setup();
    mockChannel(makeChannel());

    renderAt('/channels/ch1');
    await waitForMounted();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const body = callsWithMethod('PATCH')[0]?.[1] as { body: unknown };
    expect(body.body).toEqual({ title: 'ВК школы', active: true, tags: [] });
  });

  it('заполненный токен — config уходит целиком', async () => {
    const user = userEvent.setup();
    mockChannel(makeChannel());

    renderAt('/channels/ch1');
    await user.type(await screen.findByLabelText('Токен сообщества'), 'newsecret');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const body = callsWithMethod('PATCH')[0]?.[1] as { body: unknown };
    expect(body.body).toEqual({
      title: 'ВК школы',
      active: true,
      config: { token: 'newsecret', peerId: 777 },
      tags: [],
    });
  });

  it('теги предзаполнены из канала, правка уходит массивом (ADR-0108)', async () => {
    const user = userEvent.setup();
    mockChannel(makeChannel({ tags: ['новички'] }));

    renderAt('/channels/ch1');
    const tagsField = await screen.findByLabelText('Теги');
    expect(tagsField).toHaveValue('новички');

    await user.type(tagsField, ', средние');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const body = callsWithMethod('PATCH')[0]?.[1] as { body: { tags: string[] } };
    expect(body.body.tags).toEqual(['новички', 'средние']);
  });

  it('«Включён» снят — PATCH с active: false', async () => {
    const user = userEvent.setup();
    mockChannel(makeChannel({ active: true }));

    renderAt('/channels/ch1');
    await user.click(await screen.findByLabelText('Включён'));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const body = callsWithMethod('PATCH')[0]?.[1] as { body: { active: boolean } };
    expect(body.body.active).toBe(false);
  });

  it('выключенный канал — переключатель снят, объяснение рядом', async () => {
    mockChannel(makeChannel({ active: false }));

    renderAt('/channels/ch1');

    expect(await screen.findByLabelText('Включён')).not.toBeChecked();
    expect(screen.getByText(/рассылки в него не уходят/)).toBeInTheDocument();
  });

  it('ошибка сервера с details — список под формой, страница остаётся', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockChannel(makeChannel());

    renderAt('/channels/ch1');
    await waitForMounted();
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Проверьте поля.', 400, 'invalid_input', ['title: занято']),
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Проверьте поля.');
    expect(alert).toHaveTextContent('title: занято');
    expect(screen.queryByText(LIST_MARKER)).not.toBeInTheDocument();
  });
});

describe('ChannelEditorScreen — удаление', () => {
  it('«Удалить канал» спрашивает подтверждение, отмена ничего не удаляет', async () => {
    const user = userEvent.setup();
    mockChannel(makeChannel());

    renderAt('/channels/ch1');
    await user.click(await screen.findByRole('button', { name: 'Удалить канал' }));

    expect(screen.getByRole('dialog', { name: 'Удалить канал?' })).toBeInTheDocument();
    expect(callsWithMethod('DELETE')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(callsWithMethod('DELETE')).toHaveLength(0);
    expect(screen.queryByText(LIST_MARKER)).not.toBeInTheDocument();
  });

  it('подтверждение — DELETE и возврат к списку', async () => {
    const user = userEvent.setup();
    mockChannel(makeChannel());

    renderAt('/channels/ch1');
    await user.click(await screen.findByRole('button', { name: 'Удалить канал' }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(callsWithMethod('DELETE')).toHaveLength(1));
    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
  });

  it('409 при удалении — текст сервера остаётся на странице', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockChannel(makeChannel());

    renderAt('/channels/ch1');
    await waitForMounted();
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Канал используется в рассылке.', 409, 'conflict'),
    );
    await user.click(screen.getByRole('button', { name: 'Удалить канал' }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(await screen.findByText('Канал используется в рассылке.')).toBeInTheDocument();
    expect(screen.queryByText(LIST_MARKER)).not.toBeInTheDocument();
  });
});

describe('ChannelEditorScreen — проверка канала', () => {
  it('успех — текст результата, role=status', async () => {
    const user = userEvent.setup();
    mockChannel(makeChannel());

    renderAt('/channels/ch1');
    await waitForMounted();
    mockedApiFetch.mockResolvedValueOnce({ status: 'sent' });
    await user.click(screen.getByRole('button', { name: 'Отправить тест' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Тест доставлен');
  });

  it('исход failed (200) — role=alert с причиной', async () => {
    const user = userEvent.setup();
    mockChannel(makeChannel());

    renderAt('/channels/ch1');
    await waitForMounted();
    mockedApiFetch.mockResolvedValueOnce({ status: 'failed', error: 'Бот не в группе' });
    await user.click(screen.getByRole('button', { name: 'Отправить тест' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не доставлен: Бот не в группе',
    );
  });

  it('сбой сети — alert с текстом ошибки', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockChannel(makeChannel());

    renderAt('/channels/ch1');
    await waitForMounted();
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Бот не в группе.', 502, 'unknown'),
    );
    await user.click(screen.getByRole('button', { name: 'Отправить тест' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Бот не в группе.');
  });
});
