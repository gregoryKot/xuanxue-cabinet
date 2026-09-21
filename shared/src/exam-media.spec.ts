// Чистая логика без Mongo и без DI (CLAUDE.md «Тесты»): лимиты и тексты
// ошибок в форме, которую ждёт api (details ValidationPipe, VOICE-проверка).
import { describe, expect, it } from 'vitest';
import {
  EXAM_MEDIA_ALREADY_LINKED_MESSAGE,
  EXAM_MEDIA_INVALID_URL_MESSAGE,
  EXAM_MEDIA_ITEM_NOT_FOUND_MESSAGE,
  EXAM_MEDIA_KINDS,
  EXAM_MEDIA_LIMITS,
} from './exam-media';

describe('EXAM_MEDIA_KINDS', () => {
  it('три пути привязки, ровно как в ADR-0023', () => {
    expect(EXAM_MEDIA_KINDS).toEqual(['telegram', 'link', 'manual']);
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
      EXAM_MEDIA_ALREADY_LINKED_MESSAGE,
      EXAM_MEDIA_ITEM_NOT_FOUND_MESSAGE,
    ]) {
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toContain('является');
      expect(message).not.toContain('осуществляется');
    }
  });

  // ADR-0037: ссылка одна на ВОПРОС, не на попытку. И никакого «напишите
  // учителю, он поправит» — механизма правки нет ни у кого (CLAUDE.md:
  // правило без механизма не работает).
  it('отказ по повторной ссылке говорит про вопрос и не обещает правку', () => {
    expect(EXAM_MEDIA_ALREADY_LINKED_MESSAGE).toContain('вопрос');
    expect(EXAM_MEDIA_ALREADY_LINKED_MESSAGE).not.toContain('попытк');
    expect(EXAM_MEDIA_ALREADY_LINKED_MESSAGE).not.toContain('поправит');
  });
});
