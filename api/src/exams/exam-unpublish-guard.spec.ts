// Чистая логика — юнит без Mongo (CLAUDE.md «Тесты»): склонение текста
// отказа и само условие «это снятие с публикации». Сам запрос к попыткам —
// exams.service.spec.ts.
import { isUnpublishing, liveAttemptsMessage } from './exam-unpublish-guard';

describe('liveAttemptsMessage', () => {
  it.each([
    [1, 'Экзамен сейчас сдаёт 1 ученик. Дождитесь сдачи или удалите форму.'],
    [2, 'Экзамен сейчас сдают 2 ученика. Дождитесь сдачи или удалите форму.'],
    [5, 'Экзамен сейчас сдают 5 учеников. Дождитесь сдачи или удалите форму.'],
    [21, 'Экзамен сейчас сдаёт 21 ученик. Дождитесь сдачи или удалите форму.'],
  ])('%i → %s', (count, expected) => {
    expect(liveAttemptsMessage(count)).toBe(expected);
  });
});

describe('isUnpublishing', () => {
  it('published → draft/archived — да; остальное — нет', () => {
    expect(isUnpublishing('published', 'draft')).toBe(true);
    expect(isUnpublishing('published', 'archived')).toBe(true);
    expect(isUnpublishing('published', 'published')).toBe(false);
    expect(isUnpublishing('published', undefined)).toBe(false);
    expect(isUnpublishing('draft', 'archived')).toBe(false);
    expect(isUnpublishing('archived', 'draft')).toBe(false);
  });
});
