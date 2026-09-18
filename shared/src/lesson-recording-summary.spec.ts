// Юнит-тест форматтера (CLAUDE.md «Тесты»: чистая логика — без Mongo и без
// DI), включая пустую базу и склонение — образец plural-ru.spec.ts.
import { describe, expect, it } from 'vitest';
import { formatRecordingSummary } from './lesson-recording-summary';

describe('formatRecordingSummary', () => {
  it('пустая база — честное «пока нечего показать», не «0 из 0»', () => {
    expect(
      formatRecordingSummary({ periodDays: 30, lessonsPast: 0, lessonsWithRecording: 0 }),
    ).toBe('Пока нечего показать: за 30 дней ни одного прошедшего занятия.');
  });

  it('единственное занятие, есть запись — «у всех есть запись», без «1 из 1»', () => {
    expect(
      formatRecordingSummary({ periodDays: 30, lessonsPast: 1, lessonsWithRecording: 1 }),
    ).toBe('За 30 дней прошло 1 занятие, у всех есть запись.');
  });

  it('все прошедшие занятия с записью', () => {
    expect(
      formatRecordingSummary({ periodDays: 30, lessonsPast: 5, lessonsWithRecording: 5 }),
    ).toBe('За 30 дней прошло 5 занятий, у всех есть запись.');
  });

  it('ни одной записи', () => {
    expect(
      formatRecordingSummary({ periodDays: 30, lessonsPast: 4, lessonsWithRecording: 0 }),
    ).toBe('За 30 дней прошло 4 занятия, ни у одного нет записи.');
  });

  it('часть занятий с записью — число называется прямо', () => {
    expect(
      formatRecordingSummary({
        periodDays: 30,
        lessonsPast: 12,
        lessonsWithRecording: 5,
      }),
    ).toBe('За 30 дней прошло 12 занятий, у 5 есть запись.');
  });

  it('период склоняется по числу (не только «30 дней»)', () => {
    expect(
      formatRecordingSummary({ periodDays: 1, lessonsPast: 0, lessonsWithRecording: 0 }),
    ).toBe('Пока нечего показать: за 1 день ни одного прошедшего занятия.');
  });
});
