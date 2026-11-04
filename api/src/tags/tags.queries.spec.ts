// `mergeTagSummaries` — чистая логика, юнит-тест без Mongo; сами агрегации
// проверены на настоящей Mongo в tags.service.spec.ts.
import { mergeTagSummaries } from './tags.queries';

describe('mergeTagSummaries', () => {
  it('пусто — пустой список', () => {
    expect(mergeTagSummaries(new Map(), new Map())).toEqual([]);
  });

  it('тег встречается в обоих источниках — каждый посчитан своим числом', () => {
    const result = mergeTagSummaries(new Map([['дракон', 1]]), new Map([['дракон', 2]]));

    expect(result).toEqual([
      {
        tag: 'дракон',
        lessonCount: 1,
        materialCount: 2,
      },
    ]);
  });

  it('сортировка по суммарной использованности по убыванию, не по алфавиту', () => {
    const result = mergeTagSummaries(
      new Map([['а-редкий', 1]]),
      new Map([['я-частый', 5]]),
    );

    expect(result.map((row) => row.tag)).toEqual(['я-частый', 'а-редкий']);
  });

  it('равная сумма — по алфавиту (localeCompare, ru)', () => {
    const result = mergeTagSummaries(
      new Map([
        ['я', 1],
        ['а', 1],
      ]),
      new Map(),
    );

    expect(result.map((row) => row.tag)).toEqual(['а', 'я']);
  });
});
