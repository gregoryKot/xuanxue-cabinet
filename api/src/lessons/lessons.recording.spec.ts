// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»): assertValidRecordingUrl —
// единственная проверка ссылки записи, общая для DTO/HTTP и бота (правка по
// ревью PR I2b, п. 8 — бот шлёт url мимо DTO/class-validator).
import { InvalidInputError } from '../common/errors';
import { assertValidRecordingUrl } from './lessons.recording';

describe('assertValidRecordingUrl', () => {
  it('undefined — не ошибка (url необязателен, есть telegramFileId)', () => {
    expect(() => assertValidRecordingUrl(undefined)).not.toThrow();
  });

  it('корректный https-адрес — не бросает', () => {
    expect(() => assertValidRecordingUrl('https://youtu.be/abc')).not.toThrow();
  });

  it('http (не https) — InvalidInputError', () => {
    expect(() => assertValidRecordingUrl('http://youtu.be/abc')).toThrow(
      InvalidInputError,
    );
  });

  it('не URL вовсе (мусорная строка) — InvalidInputError', () => {
    expect(() => assertValidRecordingUrl('не ссылка')).toThrow(InvalidInputError);
  });

  it('https:// без хоста вовсе — InvalidInputError (WHATWG URL сам бросает на пустом host)', () => {
    expect(() => assertValidRecordingUrl('https://')).toThrow(InvalidInputError);
  });

  it('длиннее LESSON_LIMITS.url — InvalidInputError', () => {
    const url = `https://example.com/${'a'.repeat(500)}`;
    expect(() => assertValidRecordingUrl(url)).toThrow(InvalidInputError);
  });
});
