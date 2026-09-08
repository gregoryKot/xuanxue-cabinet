import { describe, expect, it } from 'vitest';
import { insertPlaceholder } from './insertPlaceholder';

describe('insertPlaceholder', () => {
  it('курсор в середине — вставка раздвигает текст, курсор сразу после неё', () => {
    const text = 'Через  минут';
    const cursor = 6; // между двумя пробелами
    const result = insertPlaceholder(text, cursor, cursor, 'название');

    expect(result.text).toBe('Через {название} минут');
    expect(result.cursor).toBe('Через {название}'.length);
  });

  it('курсор в конце — вставка дописывается в хвост', () => {
    const text = 'Привет';
    const result = insertPlaceholder(text, text.length, text.length, 'тема');

    expect(result.text).toBe('Привет{тема}');
    expect(result.cursor).toBe(result.text.length);
  });

  it('непустое выделение — заменяется вставкой, а не раздвигается вокруг', () => {
    const text = 'Привет мир';
    const start = text.indexOf('мир');
    const end = start + 'мир'.length;
    const result = insertPlaceholder(text, start, end, 'ссылка');

    expect(result.text).toBe('Привет {ссылка}');
    expect(result.cursor).toBe(result.text.length);
  });

  it('пустой текст — вставка становится всем текстом', () => {
    const result = insertPlaceholder('', 0, 0, 'группа');

    expect(result.text).toBe('{группа}');
    expect(result.cursor).toBe('{группа}'.length);
  });
});
