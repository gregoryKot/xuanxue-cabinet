// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts»), по образцу
// channels/ChannelsScreen.test.tsx.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BroadcastDto, ChannelDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import BroadcastsScreen from './BroadcastsScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

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

function makeBroadcast(overrides: Partial<BroadcastDto> = {}): BroadcastDto {
  return {
    id: 'b1',
    kind: 'manual',
    status: 'scheduled',
    text: 'Текст рассылки',
    scheduledAt: '2026-09-08T16:00:00Z',
    channelIds: ['ch1'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// `/summary` — дефолт «пока нечего показать»: числа за 30 дней
// (BroadcastsSummary.tsx) грузятся на каждом монтировании экрана, а почти ни
// один тест здесь их не проверяет — без дефолта пришлось бы дописывать путь
// в каждый вызов. Тест, которому нужен конкретный ответ или сбой, передаёт
// свой — он перекрывает дефолт (spread ниже).
function mockByPath(handlers: Record<string, unknown>) {
  const withDefaults = {
    '/summary': { emptyMessage: 'Пока нечего показать.' },
    ...handlers,
  };
  mockedApiFetch.mockImplementation((path: string) => {
    for (const [prefix, value] of Object.entries(withDefaults)) {
      if (path.startsWith(prefix)) {
        return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
      }
    }
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });
}

const NEW_MARKER = 'Здесь новая рассылка';

function renderScreen(initialEntries: string[] = ['/broadcasts']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/broadcasts" element={<BroadcastsScreen />} />
        <Route path="/broadcasts/new" element={<p>{NEW_MARKER}</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('BroadcastsScreen — загрузка', () => {
  it('показывает скелетон, пока журнал не пришёл', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderScreen();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('BroadcastsScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и «Попробовать ещё раз»', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockByPath({
      '/broadcasts': new ApiError('Сервис недоступен', 503, 'unknown'),
      '/deliveries': [],
      '/channels': [makeChannel()],
    });

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockByPath({ '/broadcasts': [], '/deliveries': [], '/channels': [makeChannel()] });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText(/рассылок нет/)).toBeInTheDocument();
  });
});

describe('BroadcastsScreen — пустой журнал', () => {
  it('честное сообщение вместо пустого списка', async () => {
    mockByPath({ '/broadcasts': [], '/deliveries': [], '/channels': [makeChannel()] });

    renderScreen();

    expect(await screen.findByText(/рассылок нет/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Новая рассылка' })).toBeInTheDocument();
  });
});

describe('BroadcastsScreen — журнал', () => {
  it('карточка рассылки, смена периода перечитывает список', async () => {
    const user = userEvent.setup();
    mockByPath({
      '/broadcasts': [makeBroadcast()],
      '/deliveries': [],
      '/channels': [makeChannel()],
    });

    renderScreen();

    expect(await screen.findByText(/Разовая рассылка/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Период/), '8');

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringMatching(/limit=200/),
        expect.anything(),
      ),
    );
  });

  it('фильтр статуса перечитывает список с параметром status', async () => {
    const user = userEvent.setup();
    mockByPath({
      '/broadcasts': [makeBroadcast()],
      '/deliveries': [],
      '/channels': [makeChannel()],
    });

    renderScreen();
    await screen.findByText(/Разовая рассылка/);

    await user.click(screen.getByRole('button', { name: 'Отправлено' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringMatching(/status=sent/),
        expect.anything(),
      ),
    );
  });

  it('открыт по ссылке с ?status=cancelled — фильтр статуса стоит сразу, без лишнего запроса', async () => {
    mockByPath({
      '/broadcasts': [makeBroadcast({ status: 'cancelled' })],
      '/deliveries': [],
      '/channels': [makeChannel()],
    });

    renderScreen(['/broadcasts?status=cancelled']);

    expect(await screen.findByRole('button', { name: 'Отменено' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringMatching(/status=cancelled/),
        expect.anything(),
      ),
    );
  });

  it('битый параметр статуса в ссылке — как будто фильтра нет, не падает', async () => {
    mockByPath({ '/broadcasts': [], '/deliveries': [], '/channels': [makeChannel()] });

    renderScreen(['/broadcasts?status=bogus']);

    expect(await screen.findByRole('button', { name: 'Все' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('«Новая рассылка» ведёт на свою страницу, а не открывает лист', async () => {
    const user = userEvent.setup();
    mockByPath({ '/broadcasts': [], '/deliveries': [], '/channels': [makeChannel()] });

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Новая рассылка' }));

    expect(screen.getByText(NEW_MARKER)).toBeInTheDocument();
  });
});

describe('BroadcastsScreen — пустой журнал с фильтром (pr-k3-fixes.md п.18)', () => {
  it('статус выбран, журнал пуст — предложить снять фильтр и расширить период', async () => {
    const user = userEvent.setup();
    mockByPath({
      '/broadcasts': [],
      '/deliveries': [],
      '/channels': [makeChannel()],
    });

    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Отправлено' }));

    expect(
      await screen.findByText('С этим статусом рассылок за период нет.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Показать все статусы' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Расширить период/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Показать все статусы' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Все' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
  });

  it('«Расширить период» переключает период на максимум', async () => {
    const user = userEvent.setup();
    mockByPath({ '/broadcasts': [], '/deliveries': [], '/channels': [makeChannel()] });

    renderScreen();
    await screen.findByText(/рассылок нет/);

    await user.click(screen.getByRole('button', { name: /Расширить период/ }));

    await waitFor(() =>
      expect(screen.getByLabelText<HTMLSelectElement>(/Период/).value).toBe('8'),
    );
  });
});

describe('BroadcastsScreen — «Ждут отправки вручную» (pr-k3-fixes.md п.7)', () => {
  it('сбой загрузки — LoadErrorBanner, «Попробовать ещё раз» перечитывает', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockByPath({
      '/broadcasts': [],
      '/deliveries': new ApiError('Сервис недоступен', 503, 'unknown'),
      '/channels': [makeChannel()],
    });

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockByPath({ '/broadcasts': [], '/deliveries': [], '/channels': [makeChannel()] });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    await waitFor(() =>
      expect(screen.queryByText('Сервис недоступен')).not.toBeInTheDocument(),
    );
  });
});

describe('BroadcastsScreen — read-after-write (pr-k3-fixes.md п.8)', () => {
  it('«Отметить отправленным» у ручной доставки в журнале — статус рассылки в журнале обновился', async () => {
    const user = userEvent.setup();
    const channel = makeChannel({ id: 'ch1', type: 'manual', title: 'Facebook' });
    const scheduled = makeBroadcast({ id: 'b1', status: 'scheduled' });
    const sent = makeBroadcast({ id: 'b1', status: 'sent' });
    mockByPath({
      '/broadcasts/b1/deliveries': [
        { id: 'd1', broadcastId: 'b1', channelId: 'ch1', status: 'manual', attempts: 0 },
      ],
      '/broadcasts': [scheduled],
      '/deliveries': [],
      '/channels': [channel],
    });

    renderScreen();
    // Заголовок статуса ищем внутри карточки рассылки, не во всём документе —
    // «Ждёт отправки» это ещё и подпись опции в фильтре статуса.
    const card = (await screen.findByText(/Разовая рассылка/)).closest(
      'li',
    ) as HTMLElement;
    expect(within(card).getByText(/Ждёт отправки/)).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Раскрыть' }));
    const markButton = await screen.findByRole('button', {
      name: 'Отметить отправленным',
    });

    mockedApiFetch.mockResolvedValueOnce({});
    mockByPath({
      '/broadcasts/b1/deliveries': [
        { id: 'd1', broadcastId: 'b1', channelId: 'ch1', status: 'sent', attempts: 0 },
      ],
      '/broadcasts': [sent],
      '/deliveries': [],
      '/channels': [channel],
    });

    await user.click(markButton);

    await waitFor(() =>
      expect(within(card).getAllByText(/Отправлено/).length).toBeGreaterThan(0),
    );
    expect(within(card).queryByText(/Ждёт отправки/)).not.toBeInTheDocument();
  });
});
