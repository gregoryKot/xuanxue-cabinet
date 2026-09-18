import { describe, expect, it } from 'vitest';
import type { MyExamDto } from '@xuanxue/shared';
import { splitNewTasks } from './splitNewTasks';

function makeExam(overrides: Partial<MyExamDto> = {}): MyExamDto {
  return {
    id: 'e1',
    title: 'Форма',
    description: '',
    level: '',
    attemptsAllowed: 1,
    attemptsUsed: 0,
    ...overrides,
  };
}

describe('splitNewTasks', () => {
  it('пустой список — обе группы пустые', () => {
    expect(splitNewTasks([])).toEqual({ newTasks: [], restTasks: [] });
  });

  it('ещё не приступал, попытки есть — новое', () => {
    const exam = makeExam();
    expect(splitNewTasks([exam])).toEqual({ newTasks: [exam], restTasks: [] });
  });

  it('попытка в работе — остальные, не новое', () => {
    const exam = makeExam({ lastAttempt: { id: 'a1', status: 'in_progress' } });
    expect(splitNewTasks([exam])).toEqual({ newTasks: [], restTasks: [exam] });
  });

  it('сдано, ждёт проверки — остальные', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      lastAttempt: { id: 'a1', status: 'submitted' },
    });
    expect(splitNewTasks([exam])).toEqual({ newTasks: [], restTasks: [exam] });
  });

  it('проверено, можно пройти ещё раз — остальные, не новое', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      lastAttempt: { id: 'a1', status: 'graded', outcome: 'needs_work' },
    });
    expect(splitNewTasks([exam])).toEqual({ newTasks: [], restTasks: [exam] });
  });

  it('попытки кончились, попытки не было — остальные (кнопки уже нет)', () => {
    const exam = makeExam({ attemptsAllowed: 0 });
    expect(splitNewTasks([exam])).toEqual({ newTasks: [], restTasks: [exam] });
  });

  it('порядок внутри каждой группы — как в исходном списке', () => {
    const newA = makeExam({ id: 'n1' });
    const oldB = makeExam({ id: 'o1', lastAttempt: { id: 'a1', status: 'submitted' } });
    const newC = makeExam({ id: 'n2' });

    expect(splitNewTasks([newA, oldB, newC])).toEqual({
      newTasks: [newA, newC],
      restTasks: [oldB],
    });
  });
});
