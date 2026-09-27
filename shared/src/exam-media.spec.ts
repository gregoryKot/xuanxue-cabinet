// Чистая логика без Mongo и без DI (CLAUDE.md «Тесты»): лимиты и тексты
// ошибок в форме, которую ждёт api (details ValidationPipe, VOICE-проверка).
import { describe, expect, it } from 'vitest';
import {
  EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE,
  EXAM_MEDIA_ATTEMPT_NOT_CONSUMED_MESSAGE,
  EXAM_MEDIA_INVALID_URL_MESSAGE,
  EXAM_MEDIA_ITEM_NOT_FOUND_MESSAGE,
  EXAM_MEDIA_KINDS,
  EXAM_MEDIA_LIMITS,
  EXAM_MEDIA_LINK_RACE_MESSAGE,
} from './exam-media';

describe('EXAM_MEDIA_KINDS', () => {
  it('четыре пути привязки (ADR-0023 + файл, ADR-0137)', () => {
    expect(EXAM_MEDIA_KINDS).toEqual(['telegram', 'link', 'manual', 'file']);
  });
});

describe('EXAM_MEDIA_LIMITS', () => {
  it('положительные, разумные для url/note', () => {
    expect(EXAM_MEDIA_LIMITS.url).toBeGreaterThan(0);
    expect(EXAM_MEDIA_LIMITS.note).toBeGreaterThan(0);
  });
});

describe('тексты ошибок', () => {
  it('непустые и не заканчиваются канцеляритом', () => {
    for (const message of [
      EXAM_MEDIA_INVALID_URL_MESSAGE,
      EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE,
      EXAM_MEDIA_ATTEMPT_NOT_CONSUMED_MESSAGE,
      EXAM_MEDIA_ITEM_NOT_FOUND_MESSAGE,
      EXAM_MEDIA_LINK_RACE_MESSAGE,
    ]) {
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toContain('является');
      expect(message).not.toContain('осуществляется');
    }
  });

  // Отзыв тестировщицы 2026-09-23: без `**` — строка уходит в Telegram
  // простым текстом, звёздочки читались бы буквально.
  it('EXAM_MEDIA_ATTEMPT_NOT_CONSUMED_MESSAGE — без маркера акцента', () => {
    expect(EXAM_MEDIA_ATTEMPT_NOT_CONSUMED_MESSAGE).not.toContain('**');
  });
});
