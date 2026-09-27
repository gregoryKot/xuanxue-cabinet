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
            options: [],
          },
        ],
      },
    ];

    const [review] = buildReviewBlocks(blocks, [{ itemId: 'i1', text: 'мой ответ' }]);

    expect(review?.questions[0]?.options).toEqual([]);
    expect(review?.questions[0]?.optionsCheck).toBeUndefined();
    expect(review?.questions[0]?.answerText).toBe('мой ответ');
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
    expect(review?.questions[0]?.answered).toBe(true);
  });

  // Отзыв владельца 2026-09-21: «0 из 3» печаталось и у неотвеченного
  // вопроса, и у честно неверного ответа — учитель не различал их.
  it('ответа на вопрос нет вовсе — ни один вариант не отмечен selected, answered: false, optionsCheck отсутствует', () => {
    const [review] = buildReviewBlocks(blocksWithOptions(), []);

    expect(review?.questions[0]?.options.every((option) => !option.selected)).toBe(true);
    expect(review?.questions[0]?.answerText).toBeUndefined();
    expect(review?.questions[0]?.answered).toBe(false);
    expect(review?.questions[0]?.optionsCheck).toBeUndefined();
  });

  it('optionIds пуст (ученик снял все галочки у multiple) — answered: false, optionsCheck отсутствует', () => {
    const [review] = buildReviewBlocks(blocksWithOptions(), [
      { itemId: 'i1', optionIds: [] },
    ]);

    expect(review?.questions[0]?.answered).toBe(false);
    expect(review?.questions[0]?.optionsCheck).toBeUndefined();
  });

  it('текстовый ответ из одних пробелов — answered: false, как будто ответа не было', () => {
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
            options: [],
          },
        ],
      },
    ];

    const [review] = buildReviewBlocks(blocks, [{ itemId: 'i1', text: '   ' }]);

    expect(review?.questions[0]?.answered).toBe(false);
  });

  // ADR-0035: imageId варианта нужен учителю на карточке проверки — та же
  // картинка, что видел сдающий.
  it('imageId варианта доезжает до карточки проверки, без ключа — если его не было', () => {
    const withImage: AttemptOptionRecord[] = [
      { id: 'o1', text: '', correct: true, imageId: 'img1' },
      { id: 'o2', text: 'без картинки', correct: false },
    ];
    const blocks: AttemptBlockRecord[] = [
      {
        id: 'b1',
        title: 'Форма',
        questions: [
          {
            itemId: 'i1',
            version: 1,
            kind: 'single',
            prompt: 'Какая стойка?',
            options: withImage,
          },
        ],
      },
    ];

    const [review] = buildReviewBlocks(blocks, [{ itemId: 'i1', optionIds: ['o1'] }]);

    expect(review?.questions[0]?.options[0]?.imageId).toBe('img1');
    expect(review?.questions[0]?.options[1]).not.toHaveProperty('imageId');
  });
});
