import { buildReviewBlocks, checkOptionAnswer } from './exam-attempt-review';
import type { AttemptBlockRecord, AttemptOptionRecord } from './exam-attempt.schema';

const OPTIONS: AttemptOptionRecord[] = [
  { id: 'o1', text: 'верно 1', correct: true },
  { id: 'o2', text: 'верно 2', correct: true },
  { id: 'o3', text: 'неверно', correct: false },
];

describe('checkOptionAnswer', () => {
  it('выбрал верный и лишний — по одному в каждой корзине', () => {
    const result = checkOptionAnswer(OPTIONS, ['o1', 'o3']);

    expect(result).toEqual({
      correctSelectedCount: 1,
      correctTotalCount: 2,
      incorrectSelectedCount: 1,
    });
  });

  it('не выбрал ничего — все счётчики выбора нулевые, кроме общего числа верных', () => {
    const result = checkOptionAnswer(OPTIONS, []);

    expect(result).toEqual({
      correctSelectedCount: 0,
      correctTotalCount: 2,
      incorrectSelectedCount: 0,
    });
  });

  it('выбрал все верные варианты — correctSelectedCount равен correctTotalCount', () => {
    const result = checkOptionAnswer(OPTIONS, ['o1', 'o2']);

    expect(result).toEqual({
      correctSelectedCount: 2,
      correctTotalCount: 2,
      incorrectSelectedCount: 0,
    });
  });
});

describe('buildReviewBlocks', () => {
  function blocksWithOptions(): AttemptBlockRecord[] {
    return [
      {
        id: 'b1',
        title: 'Форма',
        required: true,
        questions: [
          {
            itemId: 'i1',
            version: 1,
            kind: 'single',
            prompt: 'Сколько форм?',
            criteria: 'принимается любой близкий к программе ответ',
            options: OPTIONS,
          },
        ],
      },
    ];
  }

  it('вопрос без вариантов (текст/видео) — options пуст, optionsCheck отсутствует', () => {
    const blocks: AttemptBlockRecord[] = [
      {
        id: 'b1',
        title: 'Теория',
        required: true,
        questions: [
          {
            itemId: 'i1',
            version: 1,
            kind: 'text',
            prompt: 'Опишите форму словами',
            criteria: 'засчитывается любое связное описание',
            options: [],
          },
        ],
      },
    ];

    const [review] = buildReviewBlocks(blocks, [{ itemId: 'i1', text: 'мой ответ' }]);

    expect(review?.questions[0]?.options).toEqual([]);
    expect(review?.questions[0]?.optionsCheck).toBeUndefined();
    expect(review?.questions[0]?.answerText).toBe('мой ответ');
    expect(review?.questions[0]?.criteria).toBe('засчитывается любое связное описание');
  });

  it('вопрос с вариантами — отмечает correct и selected на каждом, считает optionsCheck', () => {
    const [review] = buildReviewBlocks(blocksWithOptions(), [
      { itemId: 'i1', optionIds: ['o1', 'o3'] },
    ]);

    expect(review?.questions[0]?.options).toEqual([
      { id: 'o1', text: 'верно 1', correct: true, selected: true },
      { id: 'o2', text: 'верно 2', correct: true, selected: false },
      { id: 'o3', text: 'неверно', correct: false, selected: true },
    ]);
    expect(review?.questions[0]?.optionsCheck).toEqual({
      correctSelectedCount: 1,
      correctTotalCount: 2,
      incorrectSelectedCount: 1,
    });
  });

  it('ответа на вопрос нет вовсе — ни один вариант не отмечен selected', () => {
    const [review] = buildReviewBlocks(blocksWithOptions(), []);

    expect(review?.questions[0]?.options.every((option) => !option.selected)).toBe(true);
    expect(review?.questions[0]?.answerText).toBeUndefined();
  });
});
