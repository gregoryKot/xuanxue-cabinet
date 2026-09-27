import { describe, expect, it } from 'vitest';
import { previewNote } from './previewNote';

describe('previewNote — пустой список', () => {
  it('нет вопросов — заметки нет (пустое состояние решает отдельная строка)', () => {
    expect(
      previewNote({
        itemCount: 0,
        questionsPerAttempt: undefined,
        requiredCount: 0,
        shuffleQuestions: true,
        shuffleOptions: true,
      }),
    ).toBeNull();
  });
});

describe('previewNote — весь список, без перемешивания', () => {
  it('нечего сказать — заметки нет', () => {
    expect(
      previewNote({
        itemCount: 3,
        questionsPerAttempt: undefined,
        requiredCount: 0,
        shuffleQuestions: false,
        shuffleOptions: false,
      }),
    ).toBeNull();
  });
});

describe('previewNote — весь список, с перемешиванием', () => {
  it('вопросы и варианты — одна фраза на оба', () => {
    expect(
      previewNote({
        itemCount: 3,
        questionsPerAttempt: undefined,
        requiredCount: 0,
        shuffleQuestions: true,
        shuffleOptions: true,
      }),
    ).toBe('Порядок вопросов — вопросы и варианты — в своём порядке.');
  });

  it('только вопросы', () => {
    expect(
      previewNote({
        itemCount: 3,
        questionsPerAttempt: undefined,
        requiredCount: 0,
        shuffleQuestions: true,
        shuffleOptions: false,
      }),
    ).toBe('Порядок вопросов — в своём порядке.');
  });

  it('только варианты ответа', () => {
    expect(
      previewNote({
        itemCount: 3,
        questionsPerAttempt: undefined,
        requiredCount: 0,
        shuffleQuestions: false,
        shuffleOptions: true,
      }),
    ).toBe('Порядок вопросов — варианты ответа — в своём порядке.');
  });
});

describe('previewNote — случайная часть (ADR-0082)', () => {
  it('без перемешивания и без обязательных — только «N из M»', () => {
    expect(
      previewNote({
        itemCount: 2,
        questionsPerAttempt: 1,
        requiredCount: 0,
        shuffleQuestions: false,
        shuffleOptions: false,
      }),
    ).toBe('Ученику достанется **1 из 2 вопроса**.');
  });

  it('с перемешиванием — порядок в той же строке', () => {
    expect(
      previewNote({
        itemCount: 12,
        questionsPerAttempt: 5,
        requiredCount: 0,
        shuffleQuestions: true,
        shuffleOptions: false,
      }),
    ).toBe('Ученику достанется **5 из 12 вопросов**, в своём порядке.');
  });

  it('с обязательными — число и глагол во множественном числе', () => {
    expect(
      previewNote({
        itemCount: 5,
        questionsPerAttempt: 3,
        requiredCount: 2,
        shuffleQuestions: false,
        shuffleOptions: false,
      }),
    ).toBe('Ученику достанется **3 из 5 вопросов**; **2 обязательных** попадут каждому.');
  });

  it('с одним обязательным — единственное число', () => {
    expect(
      previewNote({
        itemCount: 2,
        questionsPerAttempt: 1,
        requiredCount: 1,
        shuffleQuestions: false,
        shuffleOptions: false,
      }),
    ).toBe('Ученику достанется **1 из 2 вопроса**; **1 обязательный** попадёт каждому.');
  });
});
