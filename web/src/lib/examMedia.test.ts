// Пояс фиксирован явно в formatExamMediaReceivedAt — тест не должен зависеть
// от системного TZ раннера (тот же приём, что formatDate.test.ts).
import { describe, expect, it } from 'vitest';
import type { ExamMediaDto } from '@xuanxue/shared';
import {
  formatExamMediaDuration,
  formatExamMediaReceivedAt,
  formatExamMediaWhen,
} from './examMedia';

function makeMedia(overrides: Partial<ExamMediaDto> = {}): ExamMediaDto {
  return {
    id: 'm1',
    attemptId: 'a1',
    kind: 'telegram',
    receivedAt: '2026-09-12T16:30:00.000Z', // Сб 19:30 в Europe/Moscow (+3)
    ...overrides,
  };
}

describe('formatExamMediaDuration', () => {
  it('меньше минуты — только секунды', () => {
    expect(formatExamMediaDuration(45)).toBe('45 с');
  });

  it('ровно минуты — без секунд', () => {
    expect(formatExamMediaDuration(120)).toBe('2 мин');
  });

  it('минуты и секунды — оба числа', () => {
    expect(formatExamMediaDuration(220)).toBe('3 мин 40 с');
  });

  it('дробное число секунд округляется', () => {
    expect(formatExamMediaDuration(40.6)).toBe('41 с');
  });

  it('нет длительности, 0, отрицательное или NaN — честная пустая строка', () => {
    expect(formatExamMediaDuration(undefined)).toBe('');
    expect(formatExamMediaDuration(0)).toBe('');
    expect(formatExamMediaDuration(-5)).toBe('');
    expect(formatExamMediaDuration(NaN)).toBe('');
  });
});

// Блок ответа ученика (attempt/AttemptVideoAnswerRow.tsx) называет строкой
// выше, ЧТО пришло, и берёт отсюда только «когда» — без слова «получено»,
// иначе подпись повторяла бы соседнюю строку.
describe('formatExamMediaWhen', () => {
  it('с длительностью — дата, время и длительность, без слова «получено»', () => {
    expect(formatExamMediaWhen(makeMedia({ durationSec: 220 }), 'Europe/Moscow')).toBe(
      'Сб, 12 сентября, 19:30, 3 мин 40 с',
    );
  });

  it('без длительности — только дата и время', () => {
    const media = makeMedia({ kind: 'link', url: 'https://example.com/v' });
    expect(formatExamMediaWhen(media, 'Europe/Moscow')).toBe('Сб, 12 сентября, 19:30');
  });
});

describe('formatExamMediaReceivedAt', () => {
  it('с длительностью (kind: telegram) — дата, время и длительность одной строкой', () => {
    const media = makeMedia({ durationSec: 220 });
    expect(formatExamMediaReceivedAt(media, 'Europe/Moscow')).toBe(
      'Видео получено Сб, 12 сентября, 19:30, 3 мин 40 с',
    );
  });

  it('без длительности (kind: link/manual) — только дата и время', () => {
    const media = makeMedia({ kind: 'link', url: 'https://example.com/v' });
    expect(formatExamMediaReceivedAt(media, 'Europe/Moscow')).toBe(
      'Видео получено Сб, 12 сентября, 19:30',
    );
  });
});
