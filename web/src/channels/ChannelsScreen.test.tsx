// Список каналов: заголовок раздела, честное пустое состояние, переход на
// страницу канала и на «Добавить канал» (ADR-0033). Мокаем apiFetch
// (CLAUDE.md «Сеть только через http.ts»).
import { render, screen } from '@testing-library/react';
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
import ChannelsScreen from './ChannelsScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const NEW_MARKER = 'Здесь новый канал';
const EDITOR_MARKER = 'Здесь страница канала';

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

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/channels']}>
      <Routes>
        <Route path="/channels" element={<ChannelsScreen />} />
        <Route path="/channels/new" element={<p>{NEW_MARKER}</p>} />
        <Route path="/channels/:channelId" element={<p>{EDITOR_MARKER}</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ChannelsScreen — загрузка', () => {
  it('показывает скелетон, пока список не пришёл', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));

    const { container } = renderScreen();

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('сбой загрузки — текст ошибки и повтор', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({ '/channels': new ApiError('Сервис недоступен', 503, 'unknown') });

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockApiByPath({ '/channels': [] });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText(/Пока нет ни одного канала/)).toBeInTheDocument();
  });
});

describe('ChannelsScreen — список', () => {
  it('пустая база — объяснение раздела остаётся, честный текст вместо пустоты', async () => {
    mockApiByPath({ '/channels': [] });

    renderScreen();

    expect(await screen.findByText(/Пока нет ни одного канала/)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Каналы' })).toBeInTheDocument();
    expect(screen.getByText(/Telegram-группа подключается сама/)).toBeInTheDocument();
  });

  it('строка канала ведёт на его страницу', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/channels': [makeChannel()] });

    renderScreen();
    await user.click(await screen.findByText('ВК · ВК школы'));

    expect(screen.getByText(EDITOR_MARKER)).toBeInTheDocument();
  });

  it('«Добавить канал» ведёт на страницу нового канала', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/channels': [] });

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Добавить канал' }));

    expect(screen.getByText(NEW_MARKER)).toBeInTheDocument();
  });
});
