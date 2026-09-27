// Отдельный файл, а не правка examQuestions.test.ts (343 строки, храповик
// размера файлов не даёт таким расти) — новый случай для мягкого удаления
// вопроса из банка (ADR-0140): удалённый вопрос не предлагается в поиске,
// даже если он ещё не добавлен ни в один экзамен.
import { describe, expect, it } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import { filterQuestionCandidates } from './examQuestions';

function item(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'i1',
    kind: 'single',
    prompt: 'Зачем придумали тайцзи?',
    options: [],
    status: 'published',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('filterQuestionCandidates — удалённые из банка вопросы (ADR-0140)', () => {
  it('вопрос с deletedAt не предлагается, даже если ещё не добавлен', () => {
    const items = [
      item({ id: 'i1', prompt: 'Живой вопрос' }),
      item({ id: 'i2', prompt: 'Удалённый вопрос', deletedAt: '2026-09-27T00:00:00Z' }),
    ];

    expect(filterQuestionCandidates(items, '', []).map((i) => i.id)).toEqual(['i1']);
  });
});
