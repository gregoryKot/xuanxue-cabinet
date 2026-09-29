// apiRoute поверх замоканного apiFetch: что уходит в сеть (путь, метод,
// query) — рантайм, а что опечатка в ключе или не тот тип ответа не
// компилируются — `@ts-expect-error` ниже: `tsc` web проверяет и тесты, и
// директива без ошибки под ней сама роняет typecheck (PLAN §17.1).
import { describe, expect, it, vi } from 'vitest';
import type { InboxPageDto } from '@xuanxue/shared';
import type * as HttpModule from './http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { apiRoute, apiRoutePath } from './apiRoute';

vi.mock('./http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('./http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const PAGE: InboxPageDto = { items: [], unreadCount: 0 };

describe('apiRoutePath', () => {
  it('подставляет параметр пути и кодирует его', () => {
    expect(apiRoutePath('DELETE /me/inbox/:id', { params: { id: 'a/b' } })).toBe(
      '/me/inbox/a%2Fb',
    );
  });

  it('добавляет query в порядке полей и пропускает undefined', () => {
    expect(apiRoutePath('GET /me/inbox', { query: { limit: 20 } })).toBe(
      '/me/inbox?limit=20',
    );
    expect(apiRoutePath('GET /me/inbox', { query: { limit: undefined } })).toBe(
      '/me/inbox',
    );
    expect(apiRoutePath('POST /me/inbox/read-all')).toBe('/me/inbox/read-all');
  });
});

describe('apiRoute', () => {
  it('берёт метод и путь из ключа, signal передаёт как есть', async () => {
    mockedApiFetch.mockResolvedValue(PAGE);
    const signal = new AbortController().signal;

    const page = await apiRoute('POST /me/inbox/:id/read', {
      params: { id: 'n1' },
      signal,
    });

    expect(page).toEqual(PAGE);
    expect(mockedApiFetch).toHaveBeenCalledWith('/me/inbox/n1/read', {
      method: 'POST',
      body: undefined,
      signal,
    });
  });

  it('GET без аргумента — без query', async () => {
    mockedApiFetch.mockResolvedValue(PAGE);

    await apiRoute('GET /me/inbox');

    expect(mockedApiFetch).toHaveBeenCalledWith('/me/inbox', {
      method: 'GET',
      body: undefined,
    });
  });

  it('контракт держит tsc: ключ, параметры, тело и ответ', () => {
    // Сами вызовы не исполняются — проверка только для компилятора.
    const typeOnly = (): void => {
      // @ts-expect-error — такого маршрута в карте нет
      void apiRoute('GET /me/inbox/unknown');
      // @ts-expect-error — у маршрута есть `:id`, без params не вызвать
      void apiRoute('DELETE /me/inbox/:id');
      // @ts-expect-error — у маршрута нет тела
      void apiRoute('POST /me/inbox/read-all', { body: { all: true } });
      // @ts-expect-error — ответ страница ленты, не строка
      const text: Promise<string> = apiRoute('POST /me/inbox/read-all');
      void text;
    };
    expect(typeOnly).toBeTypeOf('function');
  });
});
