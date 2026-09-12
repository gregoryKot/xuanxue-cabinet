// Чистая логика — без Mongo (CLAUDE.md «Тесты»): сочетание kind+options.
import { assertOptionsForKind, mapOptions } from './exam-item-options';

describe('assertOptionsForKind', () => {
  it('text без вариантов — проходит, список пуст', () => {
    expect(assertOptionsForKind('text', undefined)).toEqual([]);
  });

  it('video с вариантами — InvalidInputError', () => {
    expect(() => assertOptionsForKind('video', [{ text: 'A' }])).toThrow(
      'не бывает вариантов ответа',
    );
  });

  it('single с одним вариантом — InvalidInputError (меньше optionsMin)', () => {
    expect(() => assertOptionsForKind('single', [{ text: 'A', correct: true }])).toThrow(
      'Укажите от 2 до 10',
    );
  });

  it('single с 11 вариантами — InvalidInputError (больше optionsMax)', () => {
    const options = Array.from({ length: 11 }, (_, i) => ({
      text: `Вариант ${i}`,
      correct: i === 0,
    }));
    expect(() => assertOptionsForKind('single', options)).toThrow('Укажите от 2 до 10');
  });

  it('single без отмеченного верного варианта — InvalidInputError', () => {
    expect(() => assertOptionsForKind('single', [{ text: 'A' }, { text: 'B' }])).toThrow(
      'ровно один правильный вариант',
    );
  });

  it('single с двумя отмеченными верными — InvalidInputError', () => {
    expect(() =>
      assertOptionsForKind('single', [
        { text: 'A', correct: true },
        { text: 'B', correct: true },
      ]),
    ).toThrow('ровно один правильный вариант');
  });

  it('single с ровно одним верным — проходит', () => {
    const options = [
      { text: 'A', correct: true },
      { text: 'B', correct: false },
    ];
    expect(assertOptionsForKind('single', options)).toEqual(options);
  });

  it('multiple без отмеченных верных — InvalidInputError', () => {
    expect(() =>
      assertOptionsForKind('multiple', [{ text: 'A' }, { text: 'B' }]),
    ).toThrow('хотя бы один правильный вариант');
  });

  it('multiple с двумя верными из трёх — проходит', () => {
    const options = [
      { text: 'A', correct: true },
      { text: 'B', correct: true },
      { text: 'C', correct: false },
    ];
    expect(assertOptionsForKind('multiple', options)).toEqual(options);
  });
});

describe('mapOptions', () => {
  it('correct не указан — false по умолчанию', () => {
    const [mapped] = mapOptions([{ text: 'A' }]);
    expect(mapped).toMatchObject({ text: 'A', correct: false });
    expect(typeof mapped?.id).toBe('string');
  });

  it('correct указан — сохраняется', () => {
    const [mapped] = mapOptions([{ text: 'A', correct: true }]);
    expect(mapped).toMatchObject({ text: 'A', correct: true });
  });

  it('id не указан — генерируется новый у каждого варианта', () => {
    const mapped = mapOptions([{ text: 'A' }, { text: 'B' }]);
    expect(mapped[0]?.id).not.toBe(mapped[1]?.id);
    expect(mapped.every((o) => typeof o.id === 'string' && o.id.length > 0)).toBe(true);
  });

  it('id указан — сохраняется как есть (правка существующего варианта)', () => {
    const [mapped] = mapOptions([{ id: 'existing-id', text: 'A' }]);
    expect(mapped?.id).toBe('existing-id');
  });
});
