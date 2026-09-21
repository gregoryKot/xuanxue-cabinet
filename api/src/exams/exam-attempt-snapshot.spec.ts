// Чистая логика — юнит-тест без Mongo и без DI (CLAUDE.md «Тесты»).
import type { ExamBlockDto, ExamItemDto } from '@xuanxue/shared';
import { checkOptionAnswer } from './exam-attempt-review';
import { buildAttemptBlocks, collectAttemptImageIds } from './exam-attempt-snapshot';
import type { AttemptBlockRecord } from './exam-attempt.schema';

function fixedSequence(values: number[]): () => number {
  let i = 0;
  return () => {
    const value = values[i];
    i += 1;
    if (value === undefined) throw new Error('fixedSequence: значений не хватило');
    return value;
  };
}

function item(overrides: Partial<ExamItemDto> & { id: string }): ExamItemDto {
  return {
    kind: 'text',
    prompt: `вопрос ${overrides.id}`,
    options: [],
    tags: [],
    status: 'published',
    version: 1,
    history: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function block(overrides: Partial<ExamBlockDto> & { itemIds: string[] }): ExamBlockDto {
  return { id: 'b1', title: 'Блок', shuffle: false, ...overrides };
}

/** Один вызов на все тесты ниже — перемешивание вариантов выключено, если
 * тест не просит обратного. */
function build(
  blocks: ExamBlockDto[],
  itemsById: ReadonlyMap<string, ExamItemDto>,
  random: () => number,
  shuffleOptions = false,
) {
  return buildAttemptBlocks({ blocks, itemsById, shuffleOptions, random });
}

/** Вопрос с тремя вариантами — на нём проверяются и перемешивание вариантов,
 * и безразличие автопроверки к их порядку. */
function singleChoiceItem(): ReadonlyMap<string, ExamItemDto> {
  return new Map([
    [
      'i1',
      item({
        id: 'i1',
        kind: 'single',
        options: [
          { id: 'o1', text: 'первый', correct: true },
          { id: 'o2', text: 'второй', correct: false },
          { id: 'o3', text: 'третий', correct: false },
        ],
      }),
    ],
  ]);
}

describe('buildAttemptBlocks', () => {
  it('без shuffle — порядок вопросов в блоке как в itemIds', () => {
    const itemsById = new Map([
      ['i1', item({ id: 'i1' })],
      ['i2', item({ id: 'i2' })],
    ]);
    const blocks = [block({ itemIds: ['i2', 'i1'], shuffle: false })];

    const snapshot = build(blocks, itemsById, () => 0);

    expect(snapshot[0]?.questions.map((q) => q.itemId)).toEqual(['i2', 'i1']);
  });

  it('с shuffle — порядок вопросов перемешан заданной случайностью', () => {
    const itemsById = new Map([
      ['i1', item({ id: 'i1' })],
      ['i2', item({ id: 'i2' })],
      ['i3', item({ id: 'i3' })],
    ]);
    const blocks = [block({ itemIds: ['i1', 'i2', 'i3'], shuffle: true })];

    const snapshot = build(blocks, itemsById, fixedSequence([0.9, 0.1, 0.5]));

    expect(snapshot[0]?.questions.map((q) => q.itemId)).toEqual(['i2', 'i3', 'i1']);
  });

  it('снимок несёт correct у варианта и criteria вопроса — обязательный инвариант ТЗ 4.4', () => {
    const itemsById = new Map([
      [
        'i1',
        item({
          id: 'i1',
          kind: 'single',
          criteria: 'колено уходит внутрь — незачёт',
          options: [
            { id: 'o1', text: 'верно', correct: true },
            { id: 'o2', text: 'неверно', correct: false },
          ],
        }),
      ],
    ]);
    const blocks = [block({ itemIds: ['i1'] })];

    const snapshot = build(blocks, itemsById, () => 0);

    const question = snapshot[0]?.questions[0];
    expect(question?.criteria).toBe('колено уходит внутрь — незачёт');
    expect(question?.options).toEqual([
      { id: 'o1', text: 'верно', correct: true },
      { id: 'o2', text: 'неверно', correct: false },
    ]);
  });

  it('shuffleOptions — варианты внутри вопроса перемешаны, набор id тот же', () => {
    const blocks = [block({ itemIds: ['i1'] })];

    const snapshot = build(
      blocks,
      singleChoiceItem(),
      fixedSequence([0.9, 0.1, 0.5]),
      true,
    );

    const options = snapshot[0]?.questions[0]?.options ?? [];
    expect(options.map((o) => o.id)).toEqual(['o2', 'o3', 'o1']);
    expect([...options].map((o) => o.id).sort()).toEqual(['o1', 'o2', 'o3']);
  });

  // ADR-0033: автопроверка идёт по `option.id` (exam-attempt-review.ts), а не
  // по месту в списке — перемешивание не должно менять ни одной цифры.
  it('автопроверка после перемешивания вариантов даёт тот же результат', () => {
    const blocks = [block({ itemIds: ['i1'] })];
    const answer = ['o1'];

    const plain = build(blocks, singleChoiceItem(), () => 0);
    const shuffled = build(
      blocks,
      singleChoiceItem(),
      fixedSequence([0.9, 0.1, 0.5]),
      true,
    );

    expect(checkOptionAnswer(shuffled[0]?.questions[0]?.options ?? [], answer)).toEqual(
      checkOptionAnswer(plain[0]?.questions[0]?.options ?? [], answer),
    );
  });

  it('вопрос блока не найден среди загруженных — программная ошибка (не DomainError)', () => {
    const blocks = [block({ itemIds: ['missing'] })];

    expect(() => build(blocks, new Map(), () => 0)).toThrow('не найден');
  });

  // ADR-0035: imageId варианта — часть снимка, как text/correct.
  it('imageId варианта доезжает до снимка без перемешивания', () => {
    const itemsById = new Map([
      [
        'i1',
        item({
          id: 'i1',
          kind: 'single',
          options: [
            { id: 'o1', text: '', correct: true, imageId: 'img1' },
            { id: 'o2', text: 'без картинки', correct: false },
          ],
        }),
      ],
    ]);
    const blocks = [block({ itemIds: ['i1'] })];

    const snapshot = build(blocks, itemsById, () => 0);

    const options = snapshot[0]?.questions[0]?.options ?? [];
    expect(options[0]?.imageId).toBe('img1');
    expect(options[1]).not.toHaveProperty('imageId');
  });

  it('imageId варианта доезжает до снимка и при перемешивании вариантов', () => {
    const itemsById = new Map([
      [
        'i1',
        item({
          id: 'i1',
          kind: 'single',
          options: [
            { id: 'o1', text: 'без картинки', correct: true },
            { id: 'o2', text: '', correct: false, imageId: 'img2' },
          ],
        }),
      ],
    ]);
    const blocks = [block({ itemIds: ['i1'] })];

    const snapshot = build(blocks, itemsById, fixedSequence([0.9, 0.1]), true);

    const withImage = snapshot[0]?.questions[0]?.options.find((o) => o.id === 'o2');
    expect(withImage?.imageId).toBe('img2');
  });
});

describe('collectAttemptImageIds', () => {
  function blockWithOptionImages(imageIds: (string | undefined)[]): AttemptBlockRecord {
    return {
      id: 'b1',
      title: 'Блок',
      questions: [
        {
          itemId: 'i1',
          version: 1,
          kind: 'single',
          prompt: 'p',
          options: imageIds.map((imageId, index) => ({
            id: `o${index}`,
            text: imageId ? '' : `вариант ${index}`,
            correct: index === 0,
            ...(imageId !== undefined ? { imageId } : {}),
          })),
        },
      ],
    };
  }

  it('без картинок — пустой список', () => {
    expect(
      collectAttemptImageIds([blockWithOptionImages([undefined, undefined])]),
    ).toEqual([]);
  });

  it('одна и та же картинка в нескольких вопросах — без повторов', () => {
    const blocks = [
      blockWithOptionImages(['img1', undefined]),
      blockWithOptionImages(['img1', 'img2']),
    ];

    expect(collectAttemptImageIds(blocks)).toEqual(['img1', 'img2']);
  });
});
