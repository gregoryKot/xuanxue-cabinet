// Чистая логика — без Mongo (CLAUDE.md «Тесты»): id блоков, повтор вопроса
// по всей форме, «есть хотя бы один вопрос».
import { assertNoRepeatedItems, hasAnyQuestion, mapBlocks } from './exam-blocks';

describe('mapBlocks', () => {
  it('undefined на входе — undefined на выходе (блоки в PATCH не прислали)', () => {
    expect(mapBlocks(undefined)).toBeUndefined();
  });

  it('title/shuffle/required не указаны — пустая строка и false по умолчанию', () => {
    const [mapped] = mapBlocks([{ itemIds: ['a'] }]) ?? [];
    expect(mapped).toMatchObject({
      title: '',
      itemIds: ['a'],
      shuffle: false,
      required: false,
    });
    expect(typeof mapped?.id).toBe('string');
  });

  it('id не указан — генерируется новый у каждого блока', () => {
    const mapped = mapBlocks([{ itemIds: [] }, { itemIds: [] }]) ?? [];
    expect(mapped[0]?.id).not.toBe(mapped[1]?.id);
  });

  it('id указан — сохраняется как есть (правка существующего блока)', () => {
    const [mapped] = mapBlocks([{ id: 'existing-id', itemIds: [] }]) ?? [];
    expect(mapped?.id).toBe('existing-id');
  });

  it('title/shuffle/required указаны — сохраняются как есть', () => {
    const [mapped] =
      mapBlocks([{ title: 'Теория', itemIds: ['a'], shuffle: true, required: true }]) ??
      [];
    expect(mapped).toMatchObject({
      title: 'Теория',
      shuffle: true,
      required: true,
    });
  });
});

describe('assertNoRepeatedItems', () => {
  it('вопросы без повторов — проходит', () => {
    expect(() =>
      assertNoRepeatedItems([
        { id: '1', title: '', itemIds: ['a', 'b'], shuffle: false, required: false },
        { id: '2', title: '', itemIds: ['c'], shuffle: false, required: false },
      ]),
    ).not.toThrow();
  });

  it('повтор внутри одного блока — InvalidInputError с числом повторов', () => {
    expect(() =>
      assertNoRepeatedItems([
        { id: '1', title: '', itemIds: ['a', 'a'], shuffle: false, required: false },
      ]),
    ).toThrow('повторяется 1 вопрос');
  });

  it('повтор между разными блоками — InvalidInputError (не только внутри блока)', () => {
    expect(() =>
      assertNoRepeatedItems([
        { id: '1', title: '', itemIds: ['a'], shuffle: false, required: false },
        { id: '2', title: '', itemIds: ['a'], shuffle: false, required: false },
      ]),
    ).toThrow('повторяется 1 вопрос');
  });

  it('два разных вопроса повторяются — счётчик 2', () => {
    expect(() =>
      assertNoRepeatedItems([
        { id: '1', title: '', itemIds: ['a', 'b'], shuffle: false, required: false },
        { id: '2', title: '', itemIds: ['a', 'b'], shuffle: false, required: false },
      ]),
    ).toThrow('повторяется 2 вопроса');
  });
});

describe('hasAnyQuestion', () => {
  it('нет блоков — false', () => {
    expect(hasAnyQuestion([])).toBe(false);
  });

  it('блок есть, но itemIds пуст — false', () => {
    expect(
      hasAnyQuestion([
        { id: '1', title: '', itemIds: [], shuffle: false, required: false },
      ]),
    ).toBe(false);
  });

  it('хотя бы один блок с вопросом — true', () => {
    expect(
      hasAnyQuestion([
        { id: '1', title: '', itemIds: [], shuffle: false, required: false },
        { id: '2', title: '', itemIds: ['a'], shuffle: false, required: false },
      ]),
    ).toBe(true);
  });
});
