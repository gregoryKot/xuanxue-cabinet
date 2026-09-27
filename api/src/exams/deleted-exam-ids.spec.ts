// Чистая логика фильтра — юнит-тест без Mongo (CLAUDE.md «Тесты»).
// deletedExamIds (сам запрос к базе) покрыт read-after-write в
// exam-soft-delete.spec.ts/exam-attempts.service.spec.ts.
import { buildAttemptListFilter, examIdVisibilityFilter } from './deleted-exam-ids';

describe('examIdVisibilityFilter', () => {
  it('без examId и без удалённых форм — фильтр не нужен', () => {
    expect(examIdVisibilityFilter([], undefined)).toBeUndefined();
  });

  it('без examId, есть удалённые формы — $nin по всем сразу', () => {
    expect(examIdVisibilityFilter(['a', 'b'], undefined)).toEqual({
      examId: { $nin: ['a', 'b'] },
    });
  });

  it('examId задан и не удалён — фильтр по нему как обычно', () => {
    expect(examIdVisibilityFilter(['a'], 'b')).toEqual({ examId: 'b' });
  });

  it('examId сам удалён — фильтр не совпадает ни с чем, не игнорирует условие', () => {
    expect(examIdVisibilityFilter(['a'], 'a')).toEqual({ examId: { $in: [] } });
  });
});

describe('buildAttemptListFilter', () => {
  it('ученик — фильтр по userId и без удалённых форм', () => {
    expect(buildAttemptListFilter(['a'], {}, false, 'u1')).toEqual({
      userId: 'u1',
      examId: { $nin: ['a'] },
    });
  });

  it('штат — без userId, фильтр по status добавляется', () => {
    expect(buildAttemptListFilter([], { status: 'submitted' }, true, 'u1')).toEqual({
      status: 'submitted',
    });
  });
});
