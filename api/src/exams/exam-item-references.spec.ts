// Чистая логика форматирования списка — юнит-тест без Mongo (CLAUDE.md
// «Тесты»). Запрос к базе и сама защита от удаления/архивации проверены
// против настоящей Mongo в exam-items.service.spec.ts (там, где есть и
// вопрос, и форма, ссылающаяся на него).
import { formatExamUsageList } from './exam-item-references';

describe('formatExamUsageList', () => {
  it('одна форма — без «и ещё»', () => {
    expect(formatExamUsageList(['Итоговый экзамен'])).toBe('«Итоговый экзамен»');
  });

  it('три формы (ровно лимит) — все названы, без «и ещё»', () => {
    expect(formatExamUsageList(['А', 'Б', 'В'])).toBe('«А», «Б», «В»');
  });

  it('больше лимита — первые три названы, остальные — числом со склонением', () => {
    expect(formatExamUsageList(['А', 'Б', 'В', 'Г'])).toBe('«А», «Б», «В» и ещё 1 форма');
    expect(formatExamUsageList(['А', 'Б', 'В', 'Г', 'Д'])).toBe(
      '«А», «Б», «В» и ещё 2 формы',
    );
  });
});
