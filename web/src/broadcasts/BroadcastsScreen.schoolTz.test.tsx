// Бейдж пояса школы рядом со временем в журнале (pr-k3-fixes.md п.22) —
// отдельный файл, не блок в BroadcastsScreen.test.tsx (CLAUDE.md «Файлы»,
// ориентир ≤300 строк для теста).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

// `/summary` — дефолт «пока нечего показать» (числа BroadcastsSummary.tsx
// грузятся на каждом монтировании, этот файл их не проверяет).
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

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('BroadcastsScreen — бейдж пояса школы (pr-k3-fixes.md п.22)', () => {
  it('пояс школы отличается от браузерного — бейдж рядом со временем', async () => {
    mockByPath({
      '/broadcasts': [makeBroadcast()],
      '/deliveries': [],
      '/channels': [makeChannel()],
      '/settings': {
        templates: { lesson_link: '', recording: '' },
        tz: 'Pacific/Auckland',
      },
    });

    render(
      <MemoryRouter>
        <BroadcastsScreen />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Pacific\/Auckland/)).toBeInTheDocument();
  });

  it('настройки не загрузились — журнал показывается без бейджа, без ошибки на экране', async () => {
    const { ApiError } = await import('../api/http');
    mockByPath({
      '/broadcasts': [makeBroadcast()],
      '/deliveries': [],
      '/channels': [makeChannel()],
      '/settings': new ApiError('Сервис недоступен', 503, 'unknown'),
    });

    render(
      <MemoryRouter>
        <BroadcastsScreen />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Разовая рассылка/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
