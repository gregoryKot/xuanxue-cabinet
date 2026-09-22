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
  it('без лимита времени — спрашивать нечего', () => {
    expect(getExamStartConfirm(makeExam())).toBeNull();
  });

  it('лимит есть, попытки не было («start») — диалог', () => {
    const confirm = getExamStartConfirm(makeExam({ timeLimitMin: 45 }));
    expect(confirm?.title).toBe('Вы начинаете экзамен');
    expect(confirm?.message).toContain('45 минут');
    expect(confirm?.confirmLabel).toBe('Начать экзамен');
    expect(confirm?.cancelLabel).toBe('Не сейчас');
  });

  it('лимит есть, повтор («retry») — диалог', () => {
    const exam = makeExam({
      timeLimitMin: 30,
      lastAttempt: { id: 'a1', status: 'submitted', expired: true },
    });
    expect(getExamStartConfirm(exam)?.confirmLabel).toBe('Начать экзамен');
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
});
