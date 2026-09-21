// Чистая логика — юнит-тест без Mongo и без DI (CLAUDE.md «Тесты»).
import type { AttemptBlockRecord } from '../exams/exam-attempt.schema';
import { findQuestionInSnapshot, isVideoItemInSnapshot } from './media-item-lookup';

const BLOCKS: AttemptBlockRecord[] = [
  {
    id: 'b1',
    title: 'Блок 1',
    questions: [
      { itemId: 'i1', version: 1, kind: 'text', prompt: 'вопрос 1', options: [] },
      { itemId: 'i2', version: 1, kind: 'video', prompt: 'вопрос 2', options: [] },
    ],
  },
  {
    id: 'b2',
    title: 'Блок 2',
    questions: [
      { itemId: 'i3', version: 1, kind: 'video', prompt: 'вопрос 3', options: [] },
    ],
  },
];

describe('isVideoItemInSnapshot', () => {
  it('itemId есть в снимке и это video — true', () => {
    expect(isVideoItemInSnapshot(BLOCKS, 'i2')).toBe(true);
  });

  it('itemId есть в снимке, но вопрос не video (text/single/multiple) — false', () => {
    expect(isVideoItemInSnapshot(BLOCKS, 'i1')).toBe(false);
  });

  it('itemId video-вопроса из второго блока — true (ищет по всем блокам)', () => {
    expect(isVideoItemInSnapshot(BLOCKS, 'i3')).toBe(true);
  });

  it('itemId, которого нет в снимке вовсе — false', () => {
    expect(isVideoItemInSnapshot(BLOCKS, 'чужой')).toBe(false);
  });

  it('пустой снимок — false, не падает', () => {
    expect(isVideoItemInSnapshot([], 'i1')).toBe(false);
  });
});

describe('findQuestionInSnapshot', () => {
  it('itemId есть в снимке — вопрос и его номер по сквозному порядку (1-based)', () => {
    expect(findQuestionInSnapshot(BLOCKS, 'i2')).toEqual({
      question: BLOCKS[0]?.questions[1],
      order: 2,
    });
  });

  it('itemId из второго блока — номер продолжает сквозной порядок первого блока', () => {
    expect(findQuestionInSnapshot(BLOCKS, 'i3')).toEqual({
      question: BLOCKS[1]?.questions[0],
      order: 3,
    });
  });

  it('itemId, которого нет в снимке вовсе — null, не падает', () => {
    expect(findQuestionInSnapshot(BLOCKS, 'чужой')).toBeNull();
  });

  it('пустой снимок — null', () => {
    expect(findQuestionInSnapshot([], 'i1')).toBeNull();
  });
});
