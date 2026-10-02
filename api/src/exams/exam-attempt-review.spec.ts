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

  // ADR-0133: видео вопроса и видео варианта — тем же приёмом, что imageId.
  it('видео вопроса и видео варианта доезжают до карточки проверки', () => {
    const blocks: AttemptBlockRecord[] = [
      {
        id: 'b1',
        title: 'Форма',
        questions: [
          {
            itemId: 'i1',
            version: 1,
            kind: 'single',
            prompt: 'Что не так на видео?',
            videoUrl: 'https://youtu.be/x',
            options: [
              { id: 'o1', text: '', correct: true, videoId: 'opt-vid' },
              { id: 'o2', text: 'без видео', correct: false },
            ],
          },
        ],
      },
    ];

    const [review] = buildReviewBlocks(blocks, [{ itemId: 'i1', optionIds: ['o1'] }]);

    expect(review?.questions[0]?.videoUrl).toBe('https://youtu.be/x');
    expect(review?.questions[0]?.options[0]?.videoId).toBe('opt-vid');
    expect(review?.questions[0]?.options[1]).not.toHaveProperty('videoId');
  });

  it('videoId вопроса и videoUrl варианта — тоже доезжают (второй источник каждого)', () => {
    const blocks: AttemptBlockRecord[] = [
      {
        id: 'b1',
        title: 'Форма',
        questions: [
          {
            itemId: 'i1',
            version: 1,
            kind: 'single',
            prompt: 'Что не так на видео?',
            videoId: 'item-vid',
            options: [
              { id: 'o1', text: '', correct: true, videoUrl: 'https://youtu.be/x' },
            ],
          },
        ],
      },
    ];

    const [review] = buildReviewBlocks(blocks, [{ itemId: 'i1', optionIds: ['o1'] }]);

    expect(review?.questions[0]?.videoId).toBe('item-vid');
    expect(review?.questions[0]?.options[0]?.videoUrl).toBe('https://youtu.be/x');
  });
});

// ADR-0146: у вопроса с вариантами text теперь объяснение выбора, не сам
// ответ — «отвечено» больше не значит «написал текст», значит «выбрал».
describe('answered у вопроса с вариантами (ADR-0146)', () => {
  function blocks(): AttemptBlockRecord[] {
    return [
      {
        id: 'b1',
        title: 'Форма',
        questions: [
          {
            itemId: 'i1',
            version: 1,
            kind: 'single',
            prompt: 'Сколько форм?',
            askReason: true,
            options: [
              { id: 'o1', text: 'верно', correct: true },
              { id: 'o2', text: 'неверно', correct: false },
            ],
          },
        ],
      },
    ];
  }

  it('написан только текст (объяснение) без выбора варианта — answered: false', () => {
    const [review] = buildReviewBlocks(blocks(), [
      { itemId: 'i1', text: 'потому что так' },
    ]);

    expect(review?.questions[0]?.answered).toBe(false);
    expect(review?.questions[0]?.optionsCheck).toBeUndefined();
  });

  it('выбран вариант и написано объяснение — answered: true, askReason виден на карточке', () => {
    const [review] = buildReviewBlocks(blocks(), [
      { itemId: 'i1', optionIds: ['o1'], text: 'потому что так' },
    ]);

    expect(review?.questions[0]?.answered).toBe(true);
    expect(review?.questions[0]?.answerText).toBe('потому что так');
    expect(review?.questions[0]?.askReason).toBe(true);
  });
});

// Аудит 2026-10-01, F62: карточка проверки отдаёт редакцию вопроса из
// снимка — учителю видно, какую версию он оценивает, если банк с тех пор
// правили. До фикса version стоял только на входе и ни разу не ожидался на
// выходе — пробел спека, не провал гейта.
describe('buildReviewBlocks — редакция вопроса', () => {
  it('version берётся из снимка попытки', () => {
    const blocks: AttemptBlockRecord[] = [
      {
        id: 'b1',
        title: 'Форма',
        required: true,
        questions: [
          {
            itemId: 'q1',
            version: 3,
            kind: 'single',
            prompt: 'Вопрос',
            options: OPTIONS,
          },
        ],
      },
    ];

    const [block] = buildReviewBlocks(blocks, []);

    expect(block?.questions[0]?.version).toBe(3);
  });
});
