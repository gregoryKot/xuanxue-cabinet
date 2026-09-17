// Чистая логика — без Mongo (CLAUDE.md «Тесты»): id блоков, повтор вопроса
// по всей форме, «есть хотя бы один вопрос».
import { assertNoRepeatedItems, hasAnyQuestion, mapBlocks } from './exam-blocks';

describe('mapBlocks', () => {
  it('undefined на входе — undefined на выходе (блоки в PATCH не прислали)', () => {
    expect(mapBlocks(undefined)).toBeUndefined();
  });

  it('title/shuffle не указаны — пустая строка и false по умолчанию', () => {
    const [mapped] = mapBlocks([{ itemIds: ['a'] }]) ?? [];
    expect(mapped).toMatchObject({ title: '', itemIds: ['a'], shuffle: false });
    expect(typeof mapped?.id).toBe('string');
  });

  // ADR-0033: «Блок обязателен» ни на что не влияло и ушло из контракта —
  // сохранение блока больше не пишет поле в запись (старые документы его
  // хранят до первого сохранения формы).
  it('required не пишется в запись', () => {
    const [mapped] = mapBlocks([{ itemIds: ['a'] }]) ?? [];
    expect(mapped).not.toHaveProperty('required');
  });

  it('id не указан — генерируется новый у каждого блока', () => {
    const mapped = mapBlocks([{ itemIds: [] }, { itemIds: [] }]) ?? [];
    expect(mapped[0]?.id).not.toBe(mapped[1]?.id);
  });

  it('id указан — сохраняется как есть (правка существующего блока)', () => {
    const [mapped] = mapBlocks([{ id: 'existing-id', itemIds: [] }]) ?? [];
    expect(mapped?.id).toBe('existing-id');
  });

  it('title/shuffle указаны — сохраняются как есть', () => {
    const [mapped] =
      mapBlocks([{ title: 'Теория', itemIds: ['a'], shuffle: true }]) ?? [];
    expect(mapped).toMatchObject({ title: 'Теория', shuffle: true });
  });
});

describe('assertNoRepeatedItems', () => {
  it('вопросы без повторов — проходит', () => {
    expect(() =>
      assertNoRepeatedItems([
        { id: '1', title: '', itemIds: ['a', 'b'], shuffle: false },
        { id: '2', title: '', itemIds: ['c'], shuffle: false },
      ]),
    ).not.toThrow();
  });

  it('повтор внутри одного блока — InvalidInputError с числом повторов', () => {
    expect(() =>
      assertNoRepeatedItems([
        { id: '1', title: '', itemIds: ['a', 'a'], shuffle: false },
      ]),
    ).toThrow('повторяется 1 вопрос');
  });

  it('повтор между разными блоками — InvalidInputError (не только внутри блока)', () => {
    expect(() =>
      assertNoRepeatedItems([
        { id: '1', title: '', itemIds: ['a'], shuffle: false },
        { id: '2', title: '', itemIds: ['a'], shuffle: false },
      ]),
    ).toThrow('повторяется 1 вопрос');
  });

  it('два разных вопроса повторяются — счётчик 2', () => {
    expect(() =>
      assertNoRepeatedItems([
        { id: '1', title: '', itemIds: ['a', 'b'], shuffle: false },
        { id: '2', title: '', itemIds: ['a', 'b'], shuffle: false },
      ]),
    ).toThrow('повторяется 2 вопроса');
  });
});

describe('hasAnyQuestion', () => {
  it('нет блоков — false', () => {
    expect(hasAnyQuestion([])).toBe(false);
  });

  it('блок есть, но itemIds пуст — false', () => {
    expect(hasAnyQuestion([{ id: '1', title: '', itemIds: [], shuffle: false }])).toBe(
      false,
    );
  });

  it('хотя бы один блок с вопросом — true', () => {
    expect(
      hasAnyQuestion([
        { id: '1', title: '', itemIds: [], shuffle: false },
        { id: '2', title: '', itemIds: ['a'], shuffle: false },
      ]),
    ).toBe(true);
  });
});
