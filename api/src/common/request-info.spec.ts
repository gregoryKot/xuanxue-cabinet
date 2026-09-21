// Юнит на чистые функции — без Nest и без Mongo (CLAUDE.md «Тесты»).
import { pathWithoutQuery, requestIdOf } from './request-info';

describe('requestIdOf', () => {
  it('id — строка, возвращает её как есть', () => {
    expect(requestIdOf({ id: 'req-1' })).toBe('req-1');
  });

  it('id не строка (нет поля/число) — undefined, а не текст "undefined"', () => {
    expect(requestIdOf({})).toBeUndefined();
    expect(requestIdOf({ id: 42 })).toBeUndefined();
  });
});

describe('pathWithoutQuery', () => {
  it('путь без query возвращается как есть', () => {
    expect(pathWithoutQuery('/lessons/1')).toBe('/lessons/1');
  });

  it('? и всё после него отрезаются вместе (там бывают токены входа)', () => {
    expect(pathWithoutQuery('/auth/telegram?join=abc123')).toBe('/auth/telegram');
  });

  it('# и всё после него отрезаются (вход через Telegram приносит #tgAuthResult=)', () => {
    expect(pathWithoutQuery('/login#tgAuthResult=xyz')).toBe('/login');
  });
});
