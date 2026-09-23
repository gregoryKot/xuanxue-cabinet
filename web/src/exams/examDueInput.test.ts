// Три чистые функции одного поля формы (ADR-0125) — тот же приём проверки,
// что у соседних lib/formatDate.ts: значение datetime-local зависит от часов
// машины, поэтому здесь проверяется форма (регэксп/ключевые случаи), не
// точное значение — так же, как startsAtLocal в planning/lessonFormInput.test.ts.
import { describe, expect, it } from 'vitest';
import { dueAtToIso, initialDueAtLocal, validateDueAtText } from './examDueInput';

describe('initialDueAtLocal', () => {
  it('нет срока — пустая строка', () => {
    expect(initialDueAtLocal(undefined)).toBe('');
  });

  it('есть срок — значение datetime-local', () => {
    expect(initialDueAtLocal('2026-09-30T20:59:00Z')).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
  });
});

describe('validateDueAtText', () => {
  it('пусто — валидно (без срока)', () => {
    expect(validateDueAtText('')).toBeNull();
  });

  it('корректное значение datetime-local — валидно', () => {
    expect(validateDueAtText('2026-09-30T23:59')).toBeNull();
  });

  it('нераспознаваемая строка — ошибка', () => {
    expect(validateDueAtText('не дата')).toMatch(/Срок сдачи/);
  });
});

describe('dueAtToIso', () => {
  it('пусто — undefined (поле не отправляется)', () => {
    expect(dueAtToIso('')).toBeUndefined();
  });

  it('заполнено — ISO UTC с Z', () => {
    expect(dueAtToIso('2026-09-30T23:59')).toMatch(/Z$/);
  });
});
