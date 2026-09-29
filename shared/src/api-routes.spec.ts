import { describe, expect, it } from 'vitest';
import {
  API_ROUTE_KEYS,
  API_ROUTE_METHODS,
  fillApiRoutePath,
  splitApiRouteKey,
} from './api-routes';

describe('карта маршрутов', () => {
  it('каждый ключ — «МЕТОД /путь» с известным методом', () => {
    for (const key of API_ROUTE_KEYS) {
      const { method, path } = splitApiRouteKey(key);
      expect(API_ROUTE_METHODS).toContain(method);
      expect(path.startsWith('/')).toBe(true);
    }
  });

  it('splitApiRouteKey делит ключ на метод и шаблон пути', () => {
    expect(splitApiRouteKey('POST /me/inbox/:id/read')).toEqual({
      method: 'POST',
      path: '/me/inbox/:id/read',
    });
  });
});

describe('fillApiRoutePath', () => {
  it('подставляет параметры и кодирует их', () => {
    expect(fillApiRoutePath('/me/inbox/:id/read', { id: 'a b/c' })).toBe(
      '/me/inbox/a%20b%2Fc/read',
    );
  });

  it('путь без параметров возвращает как есть', () => {
    expect(fillApiRoutePath('/me/inbox/read-all', {})).toBe('/me/inbox/read-all');
  });

  it('нет параметра — ошибка, а не `:id` в адресе', () => {
    expect(() => fillApiRoutePath('/me/inbox/:id', {})).toThrow('id');
  });
});
