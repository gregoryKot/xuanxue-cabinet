// Юнит на чистые функции — без Nest и без Mongo (CLAUDE.md «Тесты»).
import {
  alertSignaturePath,
  incomingRequestId,
  pathWithoutQuery,
  requestIdOf,
  userAgentOf,
} from './request-info';

describe('incomingRequestId', () => {
  it('строковый заголовок — возвращается как есть', () => {
    expect(incomingRequestId('req-1')).toBe('req-1');
  });

  it('заголовок продублирован массивом — берётся первое значение', () => {
    expect(incomingRequestId(['req-a', 'req-b'])).toBe('req-a');
  });

  it('заголовка нет — новый randomUUID(), не пустая строка', () => {
    const value = incomingRequestId(undefined);
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThan(0);
  });

  it('заголовок — пустая строка — тоже randomUUID(), не пустая строка как код', () => {
    const value = incomingRequestId('');
    expect(value.length).toBeGreaterThan(0);
    expect(value).not.toBe('');
  });
});

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

// Аудит 2026-10-01, F65: id попытки в сигнатуре дедупа превращал один сбой у
// 60 учеников в 60 сигнатур и сжигал часовой потолок алёртов за секунды.
describe('alertSignaturePath', () => {
  it('ObjectId в пути → :id', () => {
    expect(alertSignaturePath('/api/attempts/66f1a2b3c4d5e6f7a8b9c0d1/answers')).toBe(
      '/api/attempts/:id/answers',
    );
  });

  it('UUID и число → :id, несколько сегментов за раз', () => {
    expect(
      alertSignaturePath(
        '/api/answer-videos/3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d/parts/3',
      ),
    ).toBe('/api/answer-videos/:id/parts/:id');
  });

  it('путь без идентификаторов не меняется', () => {
    expect(alertSignaturePath('/api/lessons')).toBe('/api/lessons');
    expect(alertSignaturePath('/exams')).toBe('/exams');
  });

  it('разные маршруты остаются разными сигнатурами', () => {
    expect(alertSignaturePath('/api/a')).not.toBe(alertSignaturePath('/api/b'));
  });

  it('слово из hex-букв короче 24 знаков — не id', () => {
    expect(alertSignaturePath('/api/deadbeef/cafe')).toBe('/api/deadbeef/cafe');
  });
});
