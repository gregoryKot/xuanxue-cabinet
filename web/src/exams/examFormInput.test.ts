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
    blocks: [{ id: 'b1', title: 'Теория', itemIds: ['i1'], shuffle: true }],
    shuffleOptions: true,
    timeLimitMin: 40,
    dueAt: '2026-09-30T20:59:00Z',
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
    dueAtLocal: '',
    questionIds: [],
    requiredIds: [],
    shuffleQuestions: false,
    shuffleOptions: false,
    questionsPerAttemptText: '',
    ...overrides,
  };
}

describe('initialExamFormState', () => {
  it('null (создание) — пустые поля, одна попытка по умолчанию', () => {
    const state = initialExamFormState(null);
    expect(state.title).toBe('');
    expect(state.timeLimitMinText).toBe('');
    expect(state.attemptsAllowedText).toBe('1');
    expect(state.questionIds).toEqual([]);
    expect(state.shuffleQuestions).toBe(false);
    expect(state.shuffleOptions).toBe(false);
  });

  it('существующий экзамен — поля переносятся, вопросы одним списком', () => {
    const state = initialExamFormState(makeExam());
    expect(state.title).toBe('Форма ученика');
    expect(state.description).toBe('Итоговый экзамен');
    expect(state.level).toBe('начальный');
    expect(state.timeLimitMinText).toBe('40');
    expect(state.attemptsAllowedText).toBe('2');
    expect(state.questionIds).toEqual(['i1']);
    expect(state.shuffleQuestions).toBe(true);
    expect(state.shuffleOptions).toBe(true);
  });

  it('без лимита времени — пустая строка, не «0»', () => {
    const state = initialExamFormState(makeExam({ timeLimitMin: undefined }));
    expect(state.timeLimitMinText).toBe('');
  });

  it('у блока задан questionsPerAttempt — переносится строкой', () => {
    const state = initialExamFormState(
      makeExam({
        blocks: [
          {
            id: 'b1',
            title: '',
            itemIds: ['i1'],
            shuffle: false,
            questionsPerAttempt: 5,
          },
        ],
      }),
    );
    expect(state.questionsPerAttemptText).toBe('5');
  });

  it('у блока нет questionsPerAttempt — пустая строка, не «undefined»', () => {
    const state = initialExamFormState(makeExam());
    expect(state.questionsPerAttemptText).toBe('');
  });

  it('у блока заданы requiredItemIds — переносятся в форму', () => {
    const state = initialExamFormState(
      makeExam({
        blocks: [
          {
            id: 'b1',
            title: '',
            itemIds: ['i1', 'i2'],
            shuffle: false,
            requiredItemIds: ['i1'],
          },
        ],
      }),
    );
    expect(state.requiredIds).toEqual(['i1']);
  });

  it('у блока нет requiredItemIds — пустой список', () => {
    expect(initialExamFormState(makeExam()).requiredIds).toEqual([]);
  });

  it('есть срок сдачи — переносится значением datetime-local', () => {
    expect(initialExamFormState(makeExam()).dueAtLocal).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
  });

  it('нет срока сдачи — пустая строка, не «undefined»', () => {
    expect(initialExamFormState(makeExam({ dueAt: undefined })).dueAtLocal).toBe('');
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

  it('пустой срок сдачи — валидно (без срока)', () => {
    expect(validateExamForm(baseState({ dueAtLocal: '' }))).toBeNull();
  });

  it('нераспознаваемый срок сдачи — ошибка', () => {
    expect(validateExamForm(baseState({ dueAtLocal: 'не дата' }))).toMatch(/Срок сдачи/);
  });

  it('пустое «Вопросов ученику» — валидно (все вопросы списка)', () => {
    expect(
      validateExamForm(
        baseState({ questionIds: ['i1', 'i2'], questionsPerAttemptText: '' }),
      ),
    ).toBeNull();
  });

  it('«Вопросов ученику» не больше списка — валидно', () => {
    expect(
      validateExamForm(
        baseState({ questionIds: ['i1', 'i2'], questionsPerAttemptText: '2' }),
      ),
    ).toBeNull();
  });

  it('«Вопросов ученику» нецелое — ошибка', () => {
    expect(
      validateExamForm(
        baseState({ questionIds: ['i1', 'i2'], questionsPerAttemptText: '1.5' }),
      ),
    ).toMatch(/Вопросов ученику/);
  });

  it('«Вопросов ученику» больше списка — ошибка с числом списка и желаемым числом', () => {
    const error = validateExamForm(
      baseState({ questionIds: ['i1', 'i2'], questionsPerAttemptText: '5' }),
    );
    expect(error).toBe(
      'В списке 2 вопроса, а ученику вы хотите показать 5. Уменьшите число или добавьте вопросы.',
    );
  });

  it('обязательных больше «Вопросов ученику» — ошибка с обоими числами', () => {
    const error = validateExamForm(
      baseState({
        questionIds: ['i1', 'i2', 'i3'],
        requiredIds: ['i1', 'i2'],
        questionsPerAttemptText: '1',
      }),
    );
    expect(error).toBe(
      'Обязательных вопросов 2, а ученику вы показываете 1. Уменьшите число ' +
        'обязательных или увеличьте «Вопросов ученику».',
    );
  });

  it('обязательных не больше «Вопросов ученику» — валидно', () => {
    expect(
      validateExamForm(
        baseState({
          questionIds: ['i1', 'i2'],
          requiredIds: ['i1'],
          questionsPerAttemptText: '1',
        }),
      ),
    ).toBeNull();
  });

  it('обязательный вопрос убран из списка — не считается (проверка по очищенному списку)', () => {
    expect(
      validateExamForm(
        baseState({
          questionIds: ['i1'],
          requiredIds: ['i1', 'gone'],
          questionsPerAttemptText: '1',
        }),
      ),
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
      makeExam(),
    );
    expect(input.description).toBeNull();
    expect(input.level).toBeNull();
    expect(input.timeLimitMin).toBeNull();
  });

  it('правка: заполненный лимит времени — число', () => {
    const input = toUpdateInput(baseState({ timeLimitMinText: '20' }), makeExam());
    expect(input.timeLimitMin).toBe(20);
  });

  it('создание: пустой срок сдачи — undefined (поле не отправляется)', () => {
    expect(toCreateInput(baseState()).dueAt).toBeUndefined();
  });

  it('создание: заполненный срок сдачи — ISO UTC с Z', () => {
    const input = toCreateInput(baseState({ dueAtLocal: '2026-09-30T23:59' }));
    expect(input.dueAt).toMatch(/Z$/);
  });

  it('правка: пустой срок сдачи — null (явный сброс)', () => {
    const input = toUpdateInput(baseState({ dueAtLocal: '' }), makeExam());
    expect(input.dueAt).toBeNull();
  });

  it('правка: заполненный срок сдачи — ISO UTC с Z', () => {
    const input = toUpdateInput(
      baseState({ dueAtLocal: '2026-09-30T23:59' }),
      makeExam(),
    );
    expect(input.dueAt).toMatch(/Z$/);
  });

  it('создание: вопросы уходят одним блоком без id — сервер заведёт его сам', () => {
    const state = baseState({ questionIds: ['i1', 'i2'], shuffleQuestions: true });
    expect(toCreateInput(state).blocks).toEqual([
      { id: undefined, title: '', itemIds: ['i1', 'i2'], shuffle: true },
    ]);
  });

  it('правка: один блок с id первого блока экзамена, перемешивание вариантов отдельным полем', () => {
    const state = baseState({ questionIds: ['i1'], shuffleOptions: true });
    const input = toUpdateInput(state, makeExam());
    expect(input.blocks).toEqual([
      { id: 'b1', title: '', itemIds: ['i1'], shuffle: false },
    ]);
    expect(input.shuffleOptions).toBe(true);
  });

  it('создание: заполненное «Вопросов ученику» — число в блоке', () => {
    const state = baseState({
      questionIds: ['i1', 'i2'],
      questionsPerAttemptText: '1',
    });
    expect(toCreateInput(state).blocks).toEqual([
      {
        id: undefined,
        title: '',
        itemIds: ['i1', 'i2'],
        shuffle: false,
        questionsPerAttempt: 1,
      },
    ]);
  });

  it('создание: пустое «Вопросов ученику» — ключа questionsPerAttempt в блоке нет', () => {
    const state = baseState({ questionIds: ['i1'], questionsPerAttemptText: '' });
    expect(toCreateInput(state).blocks?.[0]).not.toHaveProperty('questionsPerAttempt');
  });

  it('правка: заполненное «Вопросов ученику» — число в блоке', () => {
    const state = baseState({
      questionIds: ['i1'],
      questionsPerAttemptText: '1',
    });
    const input = toUpdateInput(state, makeExam());
    expect(input.blocks).toEqual([
      { id: 'b1', title: '', itemIds: ['i1'], shuffle: false, questionsPerAttempt: 1 },
    ]);
  });

  it('правка: пустое «Вопросов ученику» — ключа questionsPerAttempt в блоке нет', () => {
    const state = baseState({ questionIds: ['i1'], questionsPerAttemptText: '' });
    const input = toUpdateInput(state, makeExam());
    expect(input.blocks?.[0]).not.toHaveProperty('questionsPerAttempt');
  });

  it('создание: отмеченные обязательные уходят в блок', () => {
    const state = baseState({
      questionIds: ['i1', 'i2'],
      requiredIds: ['i1'],
      questionsPerAttemptText: '1',
    });
    expect(toCreateInput(state).blocks?.[0]).toMatchObject({ requiredItemIds: ['i1'] });
  });

  it('создание: обязательный вопрос убран из списка — ключа requiredItemIds нет', () => {
    const state = baseState({ questionIds: ['i1'], requiredIds: ['gone'] });
    expect(toCreateInput(state).blocks?.[0]).not.toHaveProperty('requiredItemIds');
  });

  it('правка: отмеченные обязательные уходят в блок', () => {
    const state = baseState({
      questionIds: ['i1'],
      requiredIds: ['i1'],
      questionsPerAttemptText: '1',
    });
    const input = toUpdateInput(state, makeExam());
    expect(input.blocks?.[0]).toMatchObject({ requiredItemIds: ['i1'] });
  });

  it('правка: нет отмеченных обязательных — ключа requiredItemIds нет', () => {
    const state = baseState({ questionIds: ['i1'] });
    const input = toUpdateInput(state, makeExam());
    expect(input.blocks?.[0]).not.toHaveProperty('requiredItemIds');
  });
});
