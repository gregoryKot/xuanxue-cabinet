import { describe, expect, it } from 'vitest';
import {
  questionsPerAttemptHint,
  questionsPerAttemptNote,
  validateQuestionsPerAttemptText,
} from './questionsPerAttempt';

describe('questionsPerAttemptNote', () => {
  it('называет число, доступное сдающему, и общий размер списка', () => {
    expect(questionsPerAttemptNote(15, 50)).toBe(
      'Ученику достанутся 15 из 50 вопросов, случайно — здесь показан весь список.',
    );
  });

  it('склонение по общему числу вопросов', () => {
    expect(questionsPerAttemptNote(1, 3)).toBe(
      'Ученику достанутся 1 из 3 вопроса, случайно — здесь показан весь список.',
    );
  });
});

describe('validateQuestionsPerAttemptText', () => {
  it('целое число в границах и не больше списка — без ошибки', () => {
    expect(validateQuestionsPerAttemptText('2', 1, 100, 3)).toBeNull();
  });

  it('не целое или вне границ — текст про границы и «пусто — все»', () => {
    expect(validateQuestionsPerAttemptText('1.5', 1, 100, 3)).toBe(
      'Вопросов ученику — целое число от 1 до 100, либо оставьте пустым: тогда достанутся все.',
    );
    expect(validateQuestionsPerAttemptText('0', 1, 100, 3)).not.toBeNull();
  });

  it('больше списка — называет число в списке и желаемое число', () => {
    expect(validateQuestionsPerAttemptText('5', 1, 100, 2)).toBe(
      'В списке 2 вопроса, а ученику вы хотите показать 5. Уменьшите число или добавьте вопросы.',
    );
  });
});

describe('questionsPerAttemptHint', () => {
  it('пустой список — упрощённый текст без числа', () => {
    expect(questionsPerAttemptHint(0)).toBe('Пусто — все вопросы списка.');
  });

  it('непустой список — называет число', () => {
    expect(questionsPerAttemptHint(56)).toBe(
      'Пусто — все 56. Иначе каждому достанутся столько случайных вопросов из списка.',
    );
  });
});
