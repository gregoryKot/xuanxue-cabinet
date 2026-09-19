// Чистая логика — без Mongo и без DI (CLAUDE.md «Тесты»).
import { describe, expect, it } from 'vitest';
import { normalizeTags, parseTagsText, TAG_LIMITS } from './tags';

describe('normalizeTags', () => {
  it('обрезает пробелы по краям', () => {
    expect(normalizeTags(['  старшая  '])).toEqual(['старшая']);
  });

  it('схлопывает внутренние пробелы в один', () => {
    expect(normalizeTags(['старшая   группа'])).toEqual(['старшая группа']);
  });

  it('отбрасывает пустые и состоящие только из пробелов строки', () => {
    expect(normalizeTags(['старшая', '', '   '])).toEqual(['старшая']);
  });

  it('дедуплицирует без учёта регистра, первое написание побеждает', () => {
    expect(normalizeTags(['Старшая', 'старшая', 'СТАРШАЯ'])).toEqual(['Старшая']);
  });

  it('дедуплицирует после нормализации пробелов', () => {
    expect(normalizeTags(['старшая группа', 'Старшая  группа'])).toEqual([
      'старшая группа',
    ]);
  });

  it('обрезает список до лимита по умолчанию', () => {
    const tags = Array.from({ length: TAG_LIMITS.perRecord + 5 }, (_, i) => `тег${i}`);

    expect(normalizeTags(tags)).toHaveLength(TAG_LIMITS.perRecord);
  });

  it('обрезает список до явного max', () => {
    expect(normalizeTags(['раз', 'два', 'три'], 2)).toEqual(['раз', 'два']);
  });

  it('max считает уникальные теги, а не исходные элементы', () => {
    expect(normalizeTags(['раз', 'раз', 'раз', 'два'], 2)).toEqual(['раз', 'два']);
  });

  it('не режет длину отдельного тега — это забота DTO, не нормализации', () => {
    const long = 'а'.repeat(TAG_LIMITS.length * 2);

    expect(normalizeTags([long])).toEqual([long]);
  });

  it('пустой список остаётся пустым', () => {
    expect(normalizeTags([])).toEqual([]);
  });
});

describe('parseTagsText', () => {
  it('делит по запятой, обрезает пробелы, выбрасывает пустые куски', () => {
    expect(parseTagsText(' ян , база ,, ')).toEqual(['ян', 'база']);
  });

  it('пустая строка — пустой массив', () => {
    expect(parseTagsText('')).toEqual([]);
  });

  it('дедуплицирует без учёта регистра, как и normalizeTags', () => {
    expect(parseTagsText('Старшая, старшая')).toEqual(['Старшая']);
  });

  it('схлопывает внутренние пробелы в теге', () => {
    expect(parseTagsText('старшая   группа, тест')).toEqual(['старшая группа', 'тест']);
  });

  it('больше лимита по умолчанию — лишнее отбрасывается', () => {
    const many = Array.from(
      { length: TAG_LIMITS.perRecord + 2 },
      (_, i) => `тег${i}`,
    ).join(', ');
    expect(parseTagsText(many)).toHaveLength(TAG_LIMITS.perRecord);
  });

  it('явный max ограничивает список', () => {
    expect(parseTagsText('раз, два, три', 2)).toEqual(['раз', 'два']);
  });
});
