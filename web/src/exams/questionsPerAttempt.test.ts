import { describe, expect, it } from 'vitest';
import {
  questionsPerAttemptHint,
  validateQuestionsPerAttemptText,
} from './questionsPerAttempt';

describe('validateQuestionsPerAttemptText', () => {
  it('целое число в границах и не больше списка — без ошибки', () => {
    expect(validateQuestionsPerAttemptText('2', 1, 100, 3)).toBeNull();
  });

  it('не целое или вне границ — текст про границы и «пусто — все»', () => {
    expect(validateQuestionsPerAttemptText('1.5', 1, 100, 3)).toBe(
      'Вопросов ученику — целое число от **1** до **100**, либо оставьте пустым: тогда достанутся все.',
    );
    expect(validateQuestionsPerAttemptText('0', 1, 100, 3)).not.toBeNull();
  });

  it('больше списка — называет число в списке и желаемое число', () => {
    expect(validateQuestionsPerAttemptText('5', 1, 100, 2)).toBe(
      'В списке **2** вопроса, а ученику вы хотите показать **5**. Уменьшите число или добавьте вопросы.',
    );
  });

  it('requiredCount не задан — обязательные не проверяются', () => {
    expect(validateQuestionsPerAttemptText('2', 1, 100, 3)).toBeNull();
  });

  it('обязательных больше, чем «Вопросов ученику» — ошибка с обоими числами', () => {
    expect(validateQuestionsPerAttemptText('2', 1, 100, 5, 3)).toBe(
      'Обязательных вопросов **3**, а ученику вы показываете **2**. Уменьшите число ' +
        'обязательных или увеличьте «Вопросов ученику».',
    );
  });

  it('обязательных не больше «Вопросов ученику» — без ошибки', () => {
    expect(validateQuestionsPerAttemptText('3', 1, 100, 5, 3)).toBeNull();
  });
});

describe('questionsPerAttemptHint', () => {
  it('пустой список — объясняет пустое поле и куда добавлять вопросы', () => {
    expect(questionsPerAttemptHint(0)).toBe(
      'Пусто — ученику достанутся все вопросы. Впишите число — и каждому ' +
        '**случайная часть**. Вопросы добавляются ниже.',
    );
  });

  it('непустой список — называет число и объясняет отметку ★', () => {
    expect(questionsPerAttemptHint(56)).toBe(
      'Пусто — ученику достанутся все **56** вопросов. Число — и каждому ' +
        '**случайная часть** из 56. ★ — обязательные, попадут всем.',
    );
  });

  it('склонение числа вопросов («1 вопрос», «2 вопроса»)', () => {
    expect(questionsPerAttemptHint(1)).toContain('все **1** вопрос.');
    expect(questionsPerAttemptHint(2)).toContain('все **2** вопроса.');
  });
});
