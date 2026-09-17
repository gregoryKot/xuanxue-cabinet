// Чистая логика — без Mongo (CLAUDE.md «Тесты»): сочетание kind+options.
import { OPTION_TEXT_OR_IMAGE_MESSAGE } from '@xuanxue/shared';
import { assertOptionsForKind, collectImageIds, mapOptions } from './exam-item-options';
import type { ExamItemOptionRecord, ExamItemVersionRecord } from './exam-item.schema';

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

  // ADR-0035: вариант — текст, картинка или то и другое; пустой (ни того,
  // ни другого) не сохраняется.
  it('single — вариант без текста, но с imageId — проходит', () => {
    const options = [
      { imageId: '507f1f77bcf86cd799439011', correct: true },
      { text: 'B', correct: false },
    ];
    expect(assertOptionsForKind('single', options)).toEqual(options);
  });

  it('single — вариант без текста и без imageId — InvalidInputError', () => {
    expect(() =>
      assertOptionsForKind('single', [{ correct: true }, { text: 'B', correct: false }]),
    ).toThrow(OPTION_TEXT_OR_IMAGE_MESSAGE);
  });

  it('single — текст из одних пробелов и без imageId — InvalidInputError', () => {
    expect(() =>
      assertOptionsForKind('single', [
        { text: '   ', correct: true },
        { text: 'B', correct: false },
      ]),
    ).toThrow(OPTION_TEXT_OR_IMAGE_MESSAGE);
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

  it('text не указан — пустая строка, а не undefined (снимок и форма всегда видят строку)', () => {
    const [mapped] = mapOptions([{ imageId: '507f1f77bcf86cd799439011' }]);
    expect(mapped?.text).toBe('');
  });

  it('текст из пробелов — обрезается', () => {
    const [mapped] = mapOptions([{ text: '  A  ' }]);
    expect(mapped?.text).toBe('A');
  });

  it('imageId не передан — ключа нет вовсе, не imageId: undefined', () => {
    const [mapped] = mapOptions([{ text: 'A' }]);
    expect(mapped).not.toHaveProperty('imageId');
  });

  it('imageId передан — копируется', () => {
    const [mapped] = mapOptions([{ text: 'A', imageId: '507f1f77bcf86cd799439011' }]);
    expect(mapped?.imageId).toBe('507f1f77bcf86cd799439011');
  });
});

describe('collectImageIds', () => {
  const historyEntry = (options: ExamItemOptionRecord[]): ExamItemVersionRecord => ({
    version: 1,
    prompt: 'p',
    options,
    replacedAt: '2026-09-12T10:00:00.000Z',
  });

  it('без картинок нигде — пустой список', () => {
    const options: ExamItemOptionRecord[] = [{ id: 'o1', text: 'A', correct: true }];
    expect(collectImageIds(options, [])).toEqual([]);
  });

  it('картинка только в текущих вариантах — попадает в список', () => {
    const options: ExamItemOptionRecord[] = [
      { id: 'o1', text: '', correct: true, imageId: 'img1' },
    ];
    expect(collectImageIds(options, [])).toEqual(['img1']);
  });

  it('одна и та же картинка у нескольких вариантов и в истории — без повторов', () => {
    const options: ExamItemOptionRecord[] = [
      { id: 'o1', text: '', correct: true, imageId: 'img1' },
      { id: 'o2', text: '', correct: false, imageId: 'img1' },
    ];
    const history = [
      historyEntry([{ id: 'o1', text: '', correct: true, imageId: 'img1' }]),
    ];

    expect(collectImageIds(options, history)).toEqual(['img1']);
  });

  it('картинка есть только в истории (заменили на новую в текущей версии) — тоже в списке', () => {
    const options: ExamItemOptionRecord[] = [
      { id: 'o1', text: '', correct: true, imageId: 'img-new' },
    ];
    const history = [
      historyEntry([{ id: 'o1', text: '', correct: true, imageId: 'img-old' }]),
    ];

    expect(collectImageIds(options, history)).toEqual(
      expect.arrayContaining(['img-new', 'img-old']),
    );
    expect(collectImageIds(options, history)).toHaveLength(2);
  });
});
