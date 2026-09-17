// Чистая логика — юнит-тест без Mongo и без DI (CLAUDE.md «Тесты»).
import type { AttemptBlockRecord } from '../exams/exam-attempt.schema';
import { isVideoItemInSnapshot } from './media-item-lookup';

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
