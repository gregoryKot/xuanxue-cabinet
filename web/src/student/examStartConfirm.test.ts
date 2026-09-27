import { describe, expect, it } from 'vitest';
import type { MyExamDto } from '@xuanxue/shared';
import { getExamStartConfirm } from './examStartConfirm';

function makeExam(overrides: Partial<MyExamDto> = {}): MyExamDto {
  return {
    id: 'e1',
    title: 'Форма',
    description: '',
    level: '',
    attemptsAllowed: 2,
    attemptsUsed: 0,
    ...overrides,
  };
}

describe('getExamStartConfirm', () => {
  it('без лимита времени, попыток не было — спрашивать нечего', () => {
    expect(getExamStartConfirm(makeExam())).toBeNull();
  });

  it('лимит есть, попытки не было («start») — диалог, вариант primary', () => {
    const confirm = getExamStartConfirm(makeExam({ timeLimitMin: 45 }));
    expect(confirm?.title).toBe('Вы начинаете экзамен');
    expect(confirm?.message).toContain('45 минут');
    expect(confirm?.confirmLabel).toBe('Начать экзамен');
    expect(confirm?.cancelLabel).toBe('Не сейчас');
    expect(confirm?.confirmVariant).toBe('primary');
  });

  it('лимит есть, но попытка уже идёт («continue») — без вопроса, часы уже тикают', () => {
    const exam = makeExam({
      timeLimitMin: 45,
      lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
    });
    expect(getExamStartConfirm(exam)).toBeNull();
  });

  it('лимит есть, но нажимать нечего (попытки кончились) — без вопроса', () => {
    const exam = makeExam({ timeLimitMin: 45, attemptsAllowed: 1, attemptsUsed: 1 });
    expect(getExamStartConfirm(exam)).toBeNull();
  });

  // Отзыв тестировщицы 2026-09-23, п.4; решение владельца — ADR-0131: повтор
  // после просроченной непроверенной попытки затирает её — свой заголовок,
  // своя кнопка, вариант danger (необратимо), и вопрос встаёт даже без
  // лимита времени у формы.
  describe('повтор, затирающий прошлую просроченную попытку', () => {
    function retryExam(overrides: Partial<MyExamDto> = {}): MyExamDto {
      return makeExam({
        lastAttempt: { id: 'a1', status: 'submitted', expired: true },
        ...overrides,
      });
    }

    it('лимита времени нет — всё равно диалог, danger', () => {
      const confirm = getExamStartConfirm(retryExam());
      expect(confirm?.title).toBe('Начать заново?');
      expect(confirm?.confirmLabel).toBe('Начать заново');
      expect(confirm?.confirmVariant).toBe('danger');
      expect(confirm?.message).toContain('удалится');
    });

    it('факт удаления — полужирным (CLAUDE.md «Акценты», ADR-0124)', () => {
      const confirm = getExamStartConfirm(retryExam());
      expect(confirm?.message).toContain('**прошлая попытка удалится**');
    });

    it('лимит времени есть — тот же диалог, дополнительно текст про часы', () => {
      const confirm = getExamStartConfirm(retryExam({ timeLimitMin: 30 }));
      expect(confirm?.title).toBe('Начать заново?');
      expect(confirm?.message).toContain('30 минут');
      expect(confirm?.confirmVariant).toBe('danger');
    });
  });

  it('повтор после проверенной работы (graded) — обычный диалог, ничего не удаляется', () => {
    const exam = makeExam({
      timeLimitMin: 30,
      lastAttempt: { id: 'a1', status: 'graded', expired: false, outcome: 'passed' },
    });
    const confirm = getExamStartConfirm(exam);
    expect(confirm?.title).toBe('Вы начинаете экзамен');
    expect(confirm?.confirmVariant).toBe('primary');
  });

  it('повтор после проверенной работы (graded), лимита времени нет — спрашивать нечего', () => {
    const exam = makeExam({
      lastAttempt: { id: 'a1', status: 'graded', expired: false, outcome: 'passed' },
    });
    expect(getExamStartConfirm(exam)).toBeNull();
  });
});
