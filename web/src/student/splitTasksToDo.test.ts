import { describe, expect, it } from 'vitest';
import type { MyExamDto } from '@xuanxue/shared';
import { splitTasksToDo } from './splitTasksToDo';

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

describe('splitTasksToDo', () => {
  it('пустой список — обе группы пустые', () => {
    expect(splitTasksToDo([])).toEqual({ toDo: [], done: [] });
  });

  it('ещё не приступал, попытки есть — сдавать сейчас', () => {
    const exam = makeExam();
    expect(splitTasksToDo([exam])).toEqual({ toDo: [exam], done: [] });
  });

  it('попытка не закончена — сдавать сейчас', () => {
    const exam = makeExam({
      lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
    });
    expect(splitTasksToDo([exam])).toEqual({ toDo: [exam], done: [] });
  });

  // Работа у учителя: нажимать нечего, ждать ученику тоже нечего — карточка
  // уезжает к законченным, а не висит там, где ищут «что сдавать».
  it('отправлено, ждёт проверки — уже позади', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      lastAttempt: { id: 'a1', status: 'submitted', expired: false },
    });
    expect(splitTasksToDo([exam])).toEqual({ toDo: [], done: [exam] });
  });

  it('вернули на доработку, попытка осталась — сдавать сейчас', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      lastAttempt: { id: 'a1', status: 'graded', outcome: 'needs_work', expired: false },
    });
    expect(splitTasksToDo([exam])).toEqual({ toDo: [exam], done: [] });
  });

  it('не сдан, попытка осталась — сдавать сейчас', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      lastAttempt: { id: 'a1', status: 'graded', outcome: 'failed', expired: false },
    });
    expect(splitTasksToDo([exam])).toEqual({ toDo: [exam], done: [] });
  });

  // ADR-0120: кнопка «Пройти ещё раз» у сданного экзамена остаётся, группа —
  // нет. Пересдача сданного — дело самого ученика, а не то, чего ждёт школа.
  it('экзамен сдан, попытка осталась — уже позади, хотя кнопка есть', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      lastAttempt: { id: 'a1', status: 'graded', outcome: 'passed', expired: false },
    });
    expect(splitTasksToDo([exam])).toEqual({ toDo: [], done: [exam] });
  });

  it('время закрыло попытку, попытка осталась — сдавать сейчас', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      lastAttempt: { id: 'a1', status: 'submitted', expired: true },
    });
    expect(splitTasksToDo([exam])).toEqual({ toDo: [exam], done: [] });
  });

  it('попытки кончились — уже позади', () => {
    const exam = makeExam({ attemptsAllowed: 1, attemptsUsed: 1 });
    expect(splitTasksToDo([exam])).toEqual({ toDo: [], done: [exam] });
  });

  it('порядок внутри каждой группы — как в исходном списке', () => {
    const first = makeExam({ id: 'n1' });
    const middle = makeExam({
      id: 'o1',
      lastAttempt: { id: 'a1', status: 'submitted', expired: false },
    });
    const last = makeExam({ id: 'n2' });

    expect(splitTasksToDo([first, middle, last])).toEqual({
      toDo: [first, last],
      done: [middle],
    });
  });

  // ADR-0121 (отзыв владельца 2026-09-22): идущая попытка — первой в
  // «Сдавать сейчас», у неё одной тикают часы.
  it('идущая попытка — первой в «Сдавать сейчас», даже если стоит последней в ответе', () => {
    const notStarted = makeExam({ id: 'e1' });
    const running = makeExam({
      id: 'e2',
      lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
    });

    expect(splitTasksToDo([notStarted, running])).toEqual({
      toDo: [running, notStarted],
      done: [],
    });
  });

  it('сортировка стабильна: порядок карточек без идущей попытки не меняется', () => {
    const running = makeExam({
      id: 'e1',
      lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
    });
    const second = makeExam({ id: 'e2' });
    const third = makeExam({ id: 'e3' });

    expect(splitTasksToDo([second, running, third])).toEqual({
      toDo: [running, second, third],
      done: [],
    });
  });

  it('несколько идущих попыток сразу — обе впереди, остальные не трогает', () => {
    const notStarted = makeExam({ id: 'e1' });
    const running1 = makeExam({
      id: 'e2',
      lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
    });
    const running2 = makeExam({
      id: 'e3',
      lastAttempt: { id: 'a2', status: 'in_progress', expired: false },
    });

    expect(splitTasksToDo([notStarted, running1, running2])).toEqual({
      toDo: [running1, running2, notStarted],
      done: [],
    });
  });
});
