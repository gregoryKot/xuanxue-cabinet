// Чистая логика — юнит-тест без Mongo и без DI (CLAUDE.md «Тесты»).
import type { AttemptBlockRecord } from './exam-attempt.schema';
import { assertAnswersKnown, mergeAnswers } from './exam-attempt-answers';

const BLOCKS: AttemptBlockRecord[] = [
  {
    id: 'b1',
    title: 'Блок',
    required: false,
    questions: [
      { itemId: 'i1', version: 1, kind: 'text', prompt: 'вопрос 1', options: [] },
      { itemId: 'i2', version: 1, kind: 'text', prompt: 'вопрос 2', options: [] },
    ],
  },
];

describe('assertAnswersKnown', () => {
  it('ответы только на вопросы снимка — не бросает', () => {
    expect(() =>
      assertAnswersKnown(BLOCKS, [{ itemId: 'i1', text: 'ответ' }]),
    ).not.toThrow();
  });

  it('ответ на itemId не из снимка — InvalidInputError', () => {
    expect(() =>
      assertAnswersKnown(BLOCKS, [{ itemId: 'чужой', text: 'мусор' }]),
    ).toThrow('не из вашей попытки');
  });

  it('пустой список ответов — не бросает', () => {
    expect(() => assertAnswersKnown(BLOCKS, [])).not.toThrow();
  });
});

describe('mergeAnswers', () => {
  it('новый itemId — добавляется, старые ответы остаются', () => {
    const current = [{ itemId: 'i1', text: 'первый' }];

    const merged = mergeAnswers(current, [{ itemId: 'i2', text: 'второй' }]);

    expect(merged).toEqual([
      { itemId: 'i1', text: 'первый' },
      { itemId: 'i2', text: 'второй' },
    ]);
  });

  it('тот же itemId — заменяет ответ, остальные не трогает (частичное сохранение)', () => {
    const current = [
      { itemId: 'i1', text: 'старый' },
      { itemId: 'i2', text: 'нетронутый' },
    ];

    const merged = mergeAnswers(current, [{ itemId: 'i1', text: 'новый' }]);

    expect(merged).toEqual([
      { itemId: 'i1', text: 'новый' },
      { itemId: 'i2', text: 'нетронутый' },
    ]);
  });

  it('ответ вариантами (optionIds) заменяется так же, как текстовый', () => {
    const current = [{ itemId: 'i1', optionIds: ['o1'] }];

    const merged = mergeAnswers(current, [{ itemId: 'i1', optionIds: ['o2', 'o3'] }]);

    expect(merged).toEqual([{ itemId: 'i1', optionIds: ['o2', 'o3'] }]);
  });
});
