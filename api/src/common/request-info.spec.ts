// Юнит на чистые функции — без Nest и без Mongo (CLAUDE.md «Тесты»).
import { pathWithoutQuery, requestIdOf, userAgentOf } from './request-info';

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

describe('userAgentOf', () => {
  it('строковый заголовок возвращается как есть', () => {
    expect(userAgentOf({ headers: { 'user-agent': 'Mozilla/5.0' } })).toBe('Mozilla/5.0');
  });

  it('заголовка нет — undefined, а не текст "undefined"', () => {
    expect(userAgentOf({ headers: {} })).toBeUndefined();
    expect(userAgentOf({})).toBeUndefined();
  });

  it('Node склеивает повтор заголовка массивом — берётся первое значение', () => {
    expect(userAgentOf({ headers: { 'user-agent': ['A', 'B'] } })).toBe('A');
  });
});
