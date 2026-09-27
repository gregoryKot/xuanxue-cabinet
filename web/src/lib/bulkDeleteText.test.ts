import { describe, expect, it } from 'vitest';
import type { BulkDeleteResult } from '@xuanxue/shared';
import {
  distinctFailureMessages,
  formatBulkDeleteSummary,
  formatBulkDeleteTitle,
  formatSelectedCount,
} from './bulkDeleteText';

const QUESTION_FORMS = {
  one: 'вопрос',
  few: 'вопроса',
  many: 'вопросов',
  other: 'вопроса',
};
const EXAM_FORMS = {
  one: 'экзамен',
  few: 'экзамена',
  many: 'экзаменов',
  other: 'экзамена',
};

function makeResult(overrides: Partial<BulkDeleteResult> = {}): BulkDeleteResult {
  return { deletedIds: [], failed: [], ...overrides };
}

describe('formatBulkDeleteTitle', () => {
  it.each([
    [1, 'вопрос'],
    [2, 'вопроса'],
    [5, 'вопросов'],
    [11, 'вопросов'],
    [21, 'вопрос'],
  ])('%i → «Удалить %i %s?»', (count, word) => {
    expect(formatBulkDeleteTitle(count, QUESTION_FORMS)).toBe(
      `Удалить ${count} ${word}?`,
    );
  });

  it('экзамен — своя форма существительного', () => {
    expect(formatBulkDeleteTitle(1, EXAM_FORMS)).toBe('Удалить 1 экзамен?');
    expect(formatBulkDeleteTitle(3, EXAM_FORMS)).toBe('Удалить 3 экзамена?');
  });
});

describe('formatSelectedCount', () => {
  it('подставляет число с акцентом', () => {
    expect(formatSelectedCount(5)).toBe('Выбрано: **5**');
    expect(formatSelectedCount(0)).toBe('Выбрано: **0**');
  });
});

describe('formatBulkDeleteSummary', () => {
  it('все удалились — без упоминания отказов', () => {
    const result = makeResult({ deletedIds: ['a', 'b', 'c', 'd', 'e'] });
    expect(formatBulkDeleteSummary(result, QUESTION_FORMS)).toBe(
      'Удалили **5 вопросов**',
    );
  });

  it('частичный успех — обе части, число отказов без существительного', () => {
    const result = makeResult({
      deletedIds: ['a', 'b', 'c'],
      failed: [
        { id: 'd', message: 'Только черновик можно удалить.' },
        { id: 'e', message: 'Экзамен уже сдавали — удалять нельзя.' },
      ],
    });
    expect(formatBulkDeleteSummary(result, QUESTION_FORMS)).toBe(
      'Удалили **3 вопроса**. Не удалось удалить **2**:',
    );
  });

  it('никто не удалился — существительное при отказавших', () => {
    const result = makeResult({
      failed: [
        { id: 'a', message: 'Только черновик можно удалить.' },
        { id: 'b', message: 'Только черновик можно удалить.' },
      ],
    });
    expect(formatBulkDeleteSummary(result, QUESTION_FORMS)).toBe(
      'Не удалось удалить **2 вопроса**:',
    );
  });

  it('экзамены — 1 удалённый склоняется как «1 экзамен»', () => {
    const result = makeResult({ deletedIds: ['x1'] });
    expect(formatBulkDeleteSummary(result, EXAM_FORMS)).toBe('Удалили **1 экзамен**');
  });
});

describe('distinctFailureMessages', () => {
  it('пусто — пустой список', () => {
    expect(distinctFailureMessages(makeResult())).toEqual([]);
  });

  it('убирает повторы, порядок — по первому появлению', () => {
    const result = makeResult({
      failed: [
        { id: 'a', message: 'Только черновик можно удалить.' },
        { id: 'b', message: 'Экзамен уже сдавали — удалять нельзя.' },
        { id: 'c', message: 'Только черновик можно удалить.' },
      ],
    });
    expect(distinctFailureMessages(result)).toEqual([
      'Только черновик можно удалить.',
      'Экзамен уже сдавали — удалять нельзя.',
    ]);
  });
});
