// Страница «Новая рассылка» целиком: загрузка каналов, поля, отправка и
// возврат к журналу (ADR-0033). Мок сети — по префиксу пути
// (test-support/apiFetchMock.ts).
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
import BroadcastNewScreen from './BroadcastNewScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const JOURNAL_MARKER = 'Здесь журнал рассылок';

function makeChannel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'ch1',
    type: 'vk',
    title: 'ВК школы',
    active: true,
    target: '1',
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderScreen(channels: ChannelDto[] = [makeChannel()]) {
  // `/broadcasts` — ответ на отправку формы; `/channels` — список для выбора.
  mockApiByPath({ '/channels': channels, '/broadcasts': {} });
  return render(
    <MemoryRouter initialEntries={['/broadcasts/new']}>
      <Routes>
        <Route path="/broadcasts" element={<p>{JOURNAL_MARKER}</p>} />
        <Route path="/broadcasts/new" element={<BroadcastNewScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Каналы уже пришли — единственный запрос монтирования позади, и отказ,
 * поставленный следующим, достанется отправке, а не загрузке списка. */
async function waitForMounted() {
  await screen.findByLabelText('Текст');
}

function bodyOfPost() {
  const call = mockedApiFetch.mock.calls.find(
    (c) => (c[1] as { method?: string } | undefined)?.method === 'POST',
  );
  return (call?.[1] as { body: Record<string, unknown> } | undefined)?.body;
}

describe('BroadcastNewScreen — загрузка каналов', () => {
  it('каналы ещё грузятся — скелетон, а не пустая форма', () => {
    mockApiByPath({ '/channels': new Promise(() => {}) });

    const { container } = render(
      <MemoryRouter initialEntries={['/broadcasts/new']}>
        <BroadcastNewScreen />
      </MemoryRouter>,
    );

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('сбой загрузки каналов — текст ошибки и повтор', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({ '/channels': new ApiError('Сервис недоступен', 503, 'unknown') });

    render(
      <MemoryRouter initialEntries={['/broadcasts/new']}>
        <BroadcastNewScreen />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockApiByPath({ '/channels': [makeChannel()] });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByLabelText('Текст')).toBeInTheDocument();
  });

  it('просит только включённые каналы — в выключенный рассылка не уйдёт', async () => {
    renderScreen();
    await waitForMounted();

    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('active=true'),
      expect.anything(),
    );
  });

  it('включённых каналов нет — честное сообщение вместо списка чекбоксов', async () => {
    renderScreen([]);

    expect(
      await screen.findByText(/Нет ни одного включённого канала/),
    ).toBeInTheDocument();
  });

  it('ответ без списка — страница не падает, каналов просто нет', async () => {
    mockApiByPath({ '/channels': null });

    render(
      <MemoryRouter initialEntries={['/broadcasts/new']}>
        <BroadcastNewScreen />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Нет ни одного включённого канала/),
    ).toBeInTheDocument();
  });
});

describe('BroadcastNewScreen — отправка', () => {
  it('текст, канал и «сейчас» — POST без времени, возврат к журналу', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(await screen.findByLabelText('Текст'), 'Через 30 минут занятие');
    await user.click(screen.getByLabelText('ВК · ВК школы'));
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(() => expect(bodyOfPost()).toBeDefined());
    expect(bodyOfPost()).toEqual({
      text: 'Через 30 минут занятие',
      channelIds: ['ch1'],
      idempotencyKey: expect.any(String) as string,
    });
    expect(await screen.findByText(JOURNAL_MARKER)).toBeInTheDocument();
  });

  it('выключенное «сейчас» — время отправки уходит в теле', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(await screen.findByLabelText('Текст'), 'Текст');
    await user.click(screen.getByLabelText('ВК · ВК школы'));
    await user.click(screen.getByLabelText('Отправить сейчас'));
    await user.type(screen.getByLabelText('Время отправки'), '2026-09-08T19:00');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(() => expect(bodyOfPost()).toBeDefined());
    expect(bodyOfPost()?.scheduledAt).toMatch(/Z$/);
  });

  it('время отправки не указано — фокус уходит на поле времени', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(await screen.findByLabelText('Текст'), 'Текст');
    await user.click(screen.getByLabelText('ВК · ВК школы'));
    await user.click(screen.getByLabelText('Отправить сейчас'));
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByLabelText('Время отправки')).toHaveFocus();
  });

  it('пустая форма — в предпросмотре прочерк, а не пустота', async () => {
    renderScreen();
    await waitForMounted();

    expect(screen.getByText('—', { selector: 'pre' })).toBeInTheDocument();
  });

  it('предпросмотр показывает текст как есть', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(await screen.findByLabelText('Текст'), 'Текст поста');

    expect(screen.getByText('Текст поста', { selector: 'pre' })).toBeInTheDocument();
  });

  it('пустой текст — ошибка и фокус на поле, запроса нет', async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitForMounted();

    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByLabelText('Текст')).toHaveFocus();
    expect(bodyOfPost()).toBeUndefined();
    expect(screen.queryByText(JOURNAL_MARKER)).not.toBeInTheDocument();
  });

  it('текст есть, канал не выбран — фокус уходит на список каналов', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(await screen.findByLabelText('Текст'), 'Текст');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByRole('group', { name: 'Каналы' })).toHaveFocus();
  });

  it('ошибка сервера с details — список под формой, страница остаётся', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    renderScreen();

    await user.type(await screen.findByLabelText('Текст'), 'Текст');
    await user.click(screen.getByLabelText('ВК · ВК школы'));
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Проверьте поля.', 400, 'invalid_input', ['channelIds: выключен']),
    );
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Проверьте поля.');
    expect(alert).toHaveTextContent('channelIds: выключен');
    expect(screen.queryByText(JOURNAL_MARKER)).not.toBeInTheDocument();
  });

  it('«К журналу рассылок» — ссылка наверху страницы', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('link', { name: 'К журналу рассылок' }));

    expect(screen.getByText(JOURNAL_MARKER)).toBeInTheDocument();
  });
});
