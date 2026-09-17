import { describe, expect, it } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import {
  hasOptions,
  initialExamItemFormState,
  parseTagsInput,
  toCreateInput,
  toUpdateInput,
  validateExamItemForm,
  type ExamItemFormState,
} from './examItemFormInput';

function makeItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'e1',
    kind: 'single',
    prompt: 'Сколько форм в стиле Ян?',
    hint: 'Считайте по разделам',
    criteria: 'Точное число',
    options: [
      { id: 'o1', text: '24', correct: true },
      { id: 'o2', text: '108', correct: false },
    ],
    tags: ['ян', 'база'],
    status: 'draft',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function baseState(overrides: Partial<ExamItemFormState> = {}): ExamItemFormState {
  return {
    kind: 'text',
    prompt: 'Формулировка',
    hint: '',
    criteria: '',
    options: [],
    tagsText: '',
    ...overrides,
  };
}

describe('hasOptions', () => {
  it('single/multiple — true, text/video — false', () => {
    expect(hasOptions('single')).toBe(true);
    expect(hasOptions('multiple')).toBe(true);
    expect(hasOptions('text')).toBe(false);
    expect(hasOptions('video')).toBe(false);
  });
});

describe('initialExamItemFormState', () => {
  it('null (создание) — тип text по умолчанию, пустые поля', () => {
    const state = initialExamItemFormState(null);
    expect(state.kind).toBe('text');
    expect(state.prompt).toBe('');
    expect(state.options).toEqual([]);
    expect(state.tagsText).toBe('');
  });

  it('существующий вопрос — поля и теги переносятся, options с id', () => {
    const state = initialExamItemFormState(makeItem());
    expect(state.kind).toBe('single');
    expect(state.prompt).toBe('Сколько форм в стиле Ян?');
    expect(state.hint).toBe('Считайте по разделам');
    expect(state.tagsText).toBe('ян, база');
    expect(state.options).toEqual([
      { id: 'o1', text: '24', correct: true },
      { id: 'o2', text: '108', correct: false },
    ]);
  });

  it('вопрос без hint/criteria/тегов — пустые строки, не undefined', () => {
    const state = initialExamItemFormState(
      makeItem({ hint: undefined, criteria: undefined, tags: [] }),
    );
    expect(state.hint).toBe('');
    expect(state.criteria).toBe('');
    expect(state.tagsText).toBe('');
  });
});

describe('parseTagsInput', () => {
  it('делит по запятой, обрезает пробелы, выбрасывает пустые куски', () => {
    expect(parseTagsInput(' ян , база ,, ')).toEqual(['ян', 'база']);
  });

  it('пустая строка — пустой массив', () => {
    expect(parseTagsInput('')).toEqual([]);
  });

  it('больше лимита — лишнее отбрасывается', () => {
    const many = Array.from({ length: 12 }, (_, i) => `тег${i}`).join(', ');
    expect(parseTagsInput(many)).toHaveLength(10);
  });
});

describe('validateExamItemForm — без вариантов (text/video)', () => {
  it('пустая формулировка — ошибка', () => {
    expect(validateExamItemForm(baseState({ prompt: '  ' }))).toMatch(/формулировку/);
  });

  it('формулировка есть, тип text — валидна без вариантов', () => {
    expect(validateExamItemForm(baseState())).toBeNull();
  });

  it('тип video — валидна без вариантов', () => {
    expect(validateExamItemForm(baseState({ kind: 'video' }))).toBeNull();
  });
});

describe('validateExamItemForm — single/multiple', () => {
  it('меньше optionsMin вариантов — ошибка диапазона', () => {
    expect(
      validateExamItemForm(
        baseState({ kind: 'single', options: [{ text: 'A', correct: true }] }),
      ),
    ).toMatch(/Укажите от/);
  });

  it('больше optionsMax вариантов — ошибка диапазона', () => {
    const options = Array.from({ length: 11 }, (_, i) => ({
      text: `Вариант ${i}`,
      correct: i === 0,
    }));
    expect(validateExamItemForm(baseState({ kind: 'single', options }))).toMatch(
      /Укажите от/,
    );
  });

  it('вариант с картинкой без текста — валиден (ADR-0035: текст или картинка)', () => {
    expect(
      validateExamItemForm(
        baseState({
          kind: 'single',
          options: [
            { text: '', correct: true, imageId: '507f1f77bcf86cd799439011' },
            { text: 'B', correct: false },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('существующий вариант с картинкой — imageId доезжает в форму и обратно в PATCH', () => {
    const item = makeItem({
      options: [
        { id: 'o1', text: '', correct: true, imageId: '507f1f77bcf86cd799439011' },
        { id: 'o2', text: '108', correct: false },
      ],
    });
    const state = initialExamItemFormState(item);
    expect(state.options[0]?.imageId).toBe('507f1f77bcf86cd799439011');
    expect(toUpdateInput(state).options?.[0]).toEqual({
      id: 'o1',
      text: '',
      correct: true,
      imageId: '507f1f77bcf86cd799439011',
    });
  });

  it('пустой текст одного из вариантов — ошибка', () => {
    expect(
      validateExamItemForm(
        baseState({
          kind: 'single',
          options: [
            { text: '  ', correct: true },
            { text: 'B', correct: false },
          ],
        }),
      ),
    ).toMatch(/текст или картинка/);
  });

  it('single без отмеченного верного — ошибка «ровно один»', () => {
    expect(
      validateExamItemForm(
        baseState({
          kind: 'single',
          options: [
            { text: 'A', correct: false },
            { text: 'B', correct: false },
          ],
        }),
      ),
    ).toMatch(/ровно один/);
  });

  it('single с двумя отмеченными верными — та же ошибка', () => {
    expect(
      validateExamItemForm(
        baseState({
          kind: 'single',
          options: [
            { text: 'A', correct: true },
            { text: 'B', correct: true },
          ],
        }),
      ),
    ).toMatch(/ровно один/);
  });

  it('single с ровно одним верным — валидна', () => {
    expect(
      validateExamItemForm(
        baseState({
          kind: 'single',
          options: [
            { text: 'A', correct: true },
            { text: 'B', correct: false },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('multiple без отмеченных — ошибка «хотя бы один»', () => {
    expect(
      validateExamItemForm(
        baseState({
          kind: 'multiple',
          options: [
            { text: 'A', correct: false },
            { text: 'B', correct: false },
          ],
        }),
      ),
    ).toMatch(/хотя бы один/);
  });

  it('multiple с несколькими отмеченными — валидна', () => {
    expect(
      validateExamItemForm(
        baseState({
          kind: 'multiple',
          options: [
            { text: 'A', correct: true },
            { text: 'B', correct: true },
          ],
        }),
      ),
    ).toBeNull();
  });
});

describe('toCreateInput / toUpdateInput', () => {
  it('создание, тип text — options не отправляется вовсе', () => {
    const input = toCreateInput(baseState());
    expect(input.options).toBeUndefined();
  });

  it('создание, тип single — options уходит обрезанным по краям', () => {
    const input = toCreateInput(
      baseState({
        kind: 'single',
        options: [{ text: '  24  ', correct: true }],
      }),
    );
    expect(input.options).toEqual([{ id: undefined, text: '24', correct: true }]);
  });

  it('создание: пустые hint/criteria — undefined (не отправляем поле)', () => {
    const input = toCreateInput(baseState({ hint: '  ', criteria: '' }));
    expect(input.hint).toBeUndefined();
    expect(input.criteria).toBeUndefined();
  });

  it('правка: пустые hint/criteria — null (явный сброс, ревью п.8 у занятий)', () => {
    const input = toUpdateInput(baseState({ hint: '  ', criteria: '' }));
    expect(input.hint).toBeNull();
    expect(input.criteria).toBeNull();
  });

  it('правка, тип multiple — options уходит массивом', () => {
    const input = toUpdateInput(
      baseState({
        kind: 'multiple',
        options: [
          { id: 'o1', text: 'A', correct: true },
          { text: 'B', correct: true },
        ],
      }),
    );
    expect(input.options).toEqual([
      { id: 'o1', text: 'A', correct: true },
      { id: undefined, text: 'B', correct: true },
    ]);
  });

  it('правка, тип text — options не отправляется вовсе', () => {
    const input = toUpdateInput(baseState({ kind: 'text' }));
    expect(input.options).toBeUndefined();
  });

  it('теги — строка через запятую превращается в массив на выходе', () => {
    expect(toCreateInput(baseState({ tagsText: 'ян, база' })).tags).toEqual([
      'ян',
      'база',
    ]);
    expect(toUpdateInput(baseState({ tagsText: 'ян, база' })).tags).toEqual([
      'ян',
      'база',
    ]);
  });
});
