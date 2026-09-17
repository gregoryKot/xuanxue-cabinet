// Чистая логика «что считать правкой» — без Mongo и DI (CLAUDE.md «Тесты»).
import { buildHistoryEntry, hasContentChanged } from './exam-item-content-change';
import type { ExamItemOptionRecord } from './exam-item.schema';

const OPTIONS: ExamItemOptionRecord[] = [
  { id: 'o1', text: 'Расслабить поясницу', correct: true },
  { id: 'o2', text: 'Поднять плечи', correct: false },
];

const CURRENT = {
  prompt: 'Что делает поясница в стойке?',
  hint: 'Одно предложение',
  criteria: 'Назвал расслабление',
  options: OPTIONS,
};

describe('hasContentChanged', () => {
  it('тело без содержательных полей (сменили только статус) — не правка', () => {
    expect(hasContentChanged({ status: 'archived' }, undefined, CURRENT)).toBe(false);
  });

  it('те же значения, что в вопросе — не правка: экран шлёт поля всегда', () => {
    const input = {
      prompt: CURRENT.prompt,
      hint: CURRENT.hint,
      criteria: CURRENT.criteria,
    };

    expect(hasContentChanged(input, OPTIONS, CURRENT)).toBe(false);
  });

  it('другая формулировка — правка', () => {
    expect(hasContentChanged({ prompt: 'Другой вопрос' }, undefined, CURRENT)).toBe(true);
  });

  it('подсказку стёрли (null при заполненной) — правка', () => {
    expect(hasContentChanged({ hint: null }, undefined, CURRENT)).toBe(true);
  });

  it('подсказки не было и не появилось (null при пустой) — не правка', () => {
    const withoutHint = { ...CURRENT, hint: undefined };

    expect(hasContentChanged({ hint: null }, undefined, withoutHint)).toBe(false);
  });

  it('текст варианта поменяли — правка', () => {
    const changed: ExamItemOptionRecord[] = [
      { id: 'o1', text: 'Расслабить поясницу и таз', correct: true },
      { id: 'o2', text: 'Поднять плечи', correct: false },
    ];

    expect(hasContentChanged({}, changed, CURRENT)).toBe(true);
  });

  it('отметку «верно» переставили — правка', () => {
    const changed: ExamItemOptionRecord[] = [
      { id: 'o1', text: 'Расслабить поясницу', correct: false },
      { id: 'o2', text: 'Поднять плечи', correct: true },
    ];

    expect(hasContentChanged({}, changed, CURRENT)).toBe(true);
  });

  it('вариант добавили — правка', () => {
    const changed = [...OPTIONS, { id: 'o3', text: 'Согнуть колени', correct: false }];

    expect(hasContentChanged({}, changed, CURRENT)).toBe(true);
  });
});

describe('buildHistoryEntry', () => {
  it('снимает содержательные поля текущей редакции с переданным replacedAt', () => {
    const entry = buildHistoryEntry(
      { ...CURRENT, version: 3 },
      '2026-09-12T10:00:00.000Z',
    );

    expect(entry).toEqual({
      version: 3,
      prompt: CURRENT.prompt,
      hint: CURRENT.hint,
      criteria: CURRENT.criteria,
      options: OPTIONS,
      replacedAt: '2026-09-12T10:00:00.000Z',
    });
  });
});
