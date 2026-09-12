import { describe, expect, it } from 'vitest';
import type { ExamDto } from '@xuanxue/shared';
import {
  initialExamFormState,
  toCreateInput,
  toUpdateInput,
  validateExamForm,
  type ExamFormState,
} from './examFormInput';

function makeExam(overrides: Partial<ExamDto> = {}): ExamDto {
  return {
    id: 'x1',
    title: 'Форма ученика',
    description: 'Итоговый экзамен',
    level: 'начальный',
    blocks: [
      { id: 'b1', title: 'Теория', itemIds: ['i1'], shuffle: true, required: true },
    ],
    timeLimitMin: 40,
    attemptsAllowed: 2,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function baseState(overrides: Partial<ExamFormState> = {}): ExamFormState {
  return {
    title: 'Экзамен',
    description: '',
    level: '',
    timeLimitMinText: '',
    attemptsAllowedText: '1',
    blocks: [],
    ...overrides,
  };
}

describe('initialExamFormState', () => {
  it('null (создание) — пустые поля, одна попытка по умолчанию', () => {
    const state = initialExamFormState(null);
    expect(state.title).toBe('');
    expect(state.timeLimitMinText).toBe('');
    expect(state.attemptsAllowedText).toBe('1');
    expect(state.blocks).toEqual([]);
  });

  it('существующий экзамен — поля переносятся, блоки — из initialBlockDrafts', () => {
    const state = initialExamFormState(makeExam());
    expect(state.title).toBe('Форма ученика');
    expect(state.description).toBe('Итоговый экзамен');
    expect(state.level).toBe('начальный');
    expect(state.timeLimitMinText).toBe('40');
    expect(state.attemptsAllowedText).toBe('2');
    expect(state.blocks).toEqual([
      { id: 'b1', title: 'Теория', itemIds: ['i1'], shuffle: true, required: true },
    ]);
  });

  it('без лимита времени — пустая строка, не «0»', () => {
    const state = initialExamFormState(makeExam({ timeLimitMin: undefined }));
    expect(state.timeLimitMinText).toBe('');
  });
});

describe('validateExamForm', () => {
  it('пустое название — ошибка', () => {
    expect(validateExamForm(baseState({ title: '  ' }))).toMatch(/название/);
  });

  it('пустой лимит времени — валидно (без ограничения)', () => {
    expect(validateExamForm(baseState({ timeLimitMinText: '' }))).toBeNull();
  });

  it('нецелый лимит времени — ошибка диапазона', () => {
    expect(validateExamForm(baseState({ timeLimitMinText: '1.5' }))).toMatch(
      /Лимит времени/,
    );
  });

  it('лимит времени сверх максимума — ошибка', () => {
    expect(validateExamForm(baseState({ timeLimitMinText: '9999' }))).toMatch(
      /Лимит времени/,
    );
  });

  it('число попыток меньше 1 — ошибка', () => {
    expect(validateExamForm(baseState({ attemptsAllowedText: '0' }))).toMatch(/попыток/);
  });

  it('пустое число попыток — ошибка (не считается «без ограничения»)', () => {
    expect(validateExamForm(baseState({ attemptsAllowedText: '' }))).toMatch(/попыток/);
  });

  it('валидная форма — null', () => {
    expect(
      validateExamForm(baseState({ timeLimitMinText: '30', attemptsAllowedText: '3' })),
    ).toBeNull();
  });
});

describe('toCreateInput / toUpdateInput', () => {
  it('создание: пустые описание/уровень — undefined (поле не отправляется)', () => {
    const input = toCreateInput(baseState());
    expect(input.description).toBeUndefined();
    expect(input.level).toBeUndefined();
    expect(input.timeLimitMin).toBeUndefined();
  });

  it('создание: заполненные поля уходят как есть, обрезанные по краям', () => {
    const input = toCreateInput(
      baseState({ title: '  Экзамен  ', description: ' Описание ', level: ' база ' }),
    );
    expect(input.title).toBe('Экзамен');
    expect(input.description).toBe('Описание');
    expect(input.level).toBe('база');
  });

  it('создание: лимит времени и попытки — числами', () => {
    const input = toCreateInput(
      baseState({ timeLimitMinText: '45', attemptsAllowedText: '2' }),
    );
    expect(input.timeLimitMin).toBe(45);
    expect(input.attemptsAllowed).toBe(2);
  });

  it('правка: пустые описание/уровень/лимит времени — null (явный сброс)', () => {
    const input = toUpdateInput(
      baseState({ description: '', level: '', timeLimitMinText: '' }),
    );
    expect(input.description).toBeNull();
    expect(input.level).toBeNull();
    expect(input.timeLimitMin).toBeNull();
  });

  it('правка: заполненный лимит времени — число', () => {
    const input = toUpdateInput(baseState({ timeLimitMinText: '20' }));
    expect(input.timeLimitMin).toBe(20);
  });

  it('блоки уходят через toBlockInputs (id сохраняется у существующего блока)', () => {
    const state = baseState({
      blocks: [
        { id: 'b1', title: 'Теория', itemIds: ['i1'], shuffle: false, required: false },
      ],
    });
    expect(toCreateInput(state).blocks).toEqual([
      { id: 'b1', title: 'Теория', itemIds: ['i1'], shuffle: false, required: false },
    ]);
    expect(toUpdateInput(state).blocks).toEqual([
      { id: 'b1', title: 'Теория', itemIds: ['i1'], shuffle: false, required: false },
    ]);
  });
});
