import { describe, expect, it, vi } from 'vitest';
import { EXAM_ITEM_LIMITS } from '@xuanxue/shared';
import { changeExamItemKind, optionsAfterKindChange } from './examItemKindChange';
import type { ExamItemFormState, ExamItemOptionDraft } from './examItemFormInput';

function baseState(overrides: Partial<ExamItemFormState> = {}): ExamItemFormState {
  return { kind: 'text', prompt: 'Формулировка', options: [], ...overrides };
}

describe('optionsAfterKindChange', () => {
  it('переход на text/video — варианты не трогает', () => {
    const options: ExamItemOptionDraft[] = [{ text: 'A', correct: true }];
    expect(optionsAfterKindChange('text', options)).toBe(options);
    expect(optionsAfterKindChange('video', options)).toBe(options);
  });

  it('переход на single/multiple с пустым списком — добавляет optionsMin пустых вариантов', () => {
    const result = optionsAfterKindChange('single', []);
    expect(result).toHaveLength(EXAM_ITEM_LIMITS.optionsMin);
    expect(result).toEqual(
      Array.from({ length: EXAM_ITEM_LIMITS.optionsMin }, () => ({
        text: '',
        correct: false,
      })),
    );
  });

  it('переход между single и multiple с уже введёнными вариантами — не трогает их', () => {
    const options: ExamItemOptionDraft[] = [{ text: 'A', correct: true }];
    expect(optionsAfterKindChange('multiple', options)).toBe(options);
  });
});

describe('changeExamItemKind', () => {
  it('ставит kind и добирает варианты до минимума у пустого списка', () => {
    const setField = vi.fn();
    changeExamItemKind('single', baseState({ options: [] }), setField);

    expect(setField).toHaveBeenCalledWith('kind', 'single');
    expect(setField).toHaveBeenCalledWith(
      'options',
      Array.from({ length: EXAM_ITEM_LIMITS.optionsMin }, () => ({
        text: '',
        correct: false,
      })),
    );
  });

  it('text/video — не зовёт setField для options вовсе', () => {
    const setField = vi.fn();
    changeExamItemKind('video', baseState(), setField);

    expect(setField).toHaveBeenCalledWith('kind', 'video');
    expect(setField).not.toHaveBeenCalledWith('options', expect.anything());
  });

  it('варианты уже есть — options не переписывает повторно', () => {
    const setField = vi.fn();
    const options: ExamItemOptionDraft[] = [
      { text: 'A', correct: true },
      { text: 'B', correct: false },
    ];
    changeExamItemKind('multiple', baseState({ kind: 'single', options }), setField);

    expect(setField).toHaveBeenCalledWith('kind', 'multiple');
    expect(setField).not.toHaveBeenCalledWith('options', expect.anything());
  });
});
