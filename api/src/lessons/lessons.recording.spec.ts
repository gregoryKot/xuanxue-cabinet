// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»): assertValidRecordingUrl —
// единственная проверка ссылки записи, общая для DTO/HTTP и бота (правка по
// ревью PR I2b, п. 8 — бот шлёт url мимо DTO/class-validator).
import { InvalidInputError } from '../common/errors';
import {
  assertHasRecordingSource,
  assertValidRecordingUrl,
  buildRecordingDuplicateConditions,
  buildRecordingPush,
} from './lessons.recording';

const VIDEO_ID = '507f1f77bcf86cd799439011';

describe('запись занятия с файлом в кабинете (ADR-0180)', () => {
  it('одного videoId достаточно: источник есть', () => {
    expect(() => assertHasRecordingSource({ videoId: VIDEO_ID })).not.toThrow();
  });

  it('пустая запись без url, file_id и videoId — InvalidInputError', () => {
    expect(() => assertHasRecordingSource({ title: 'Запись' })).toThrow(
      InvalidInputError,
    );
  });

  it('запись несёт url и videoId вместе — одна запись, один пост', () => {
    const recording = buildRecordingPush(
      { url: 'https://youtu.be/abc', videoId: VIDEO_ID },
      'Класс',
    );

    expect(recording).toEqual({
      title: 'Класс',
      url: 'https://youtu.be/abc',
      telegramFileId: undefined,
      videoId: VIDEO_ID,
    });
  });

  it('повтор ловится по любому из источников, включая videoId', () => {
    expect(
      buildRecordingDuplicateConditions({
        url: 'https://youtu.be/abc',
        telegramFileId: 'file-1',
        videoId: VIDEO_ID,
      }),
    ).toEqual([
      { 'recordings.url': 'https://youtu.be/abc' },
      { 'recordings.telegramFileId': 'file-1' },
      { 'recordings.videoId': VIDEO_ID },
    ]);
    expect(buildRecordingDuplicateConditions({ videoId: VIDEO_ID })).toEqual([
      { 'recordings.videoId': VIDEO_ID },
    ]);
  });
});

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
