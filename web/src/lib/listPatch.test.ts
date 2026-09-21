import { describe, expect, it } from 'vitest';
import { appended, replacedById, withoutId } from './listPatch';

interface Item {
  id: string;
  name: string;
}

const list: Item[] = [
  { id: 'a', name: 'Аня' },
  { id: 'b', name: 'Боря' },
  { id: 'c', name: 'Вася' },
];

describe('replacedById', () => {
  it('null на входе — null на выходе', () => {
    expect(replacedById(null, { id: 'a', name: 'Аня' })).toBeNull();
  });

  it('заменяет элемент с тем же id, остальные не трогает', () => {
    const result = replacedById(list, { id: 'b', name: 'Боря новый' });
    expect(result).toEqual([
      { id: 'a', name: 'Аня' },
      { id: 'b', name: 'Боря новый' },
      { id: 'c', name: 'Вася' },
    ]);
  });

  it('id не найден — список возвращается без изменений', () => {
    const result = replacedById(list, { id: 'z', name: 'Чужой' });
    expect(result).toEqual(list);
  });

  it('не мутирует входной массив', () => {
    const before = list.map((item) => ({ ...item }));
    replacedById(list, { id: 'a', name: 'Другое имя' });
    expect(list).toEqual(before);
  });

  it('возвращает новый массив, а не тот же объект', () => {
    expect(replacedById(list, { id: 'a', name: 'Аня' })).not.toBe(list);
  });
});

describe('withoutId', () => {
  it('null на входе — null на выходе', () => {
    expect(withoutId(null, 'a')).toBeNull();
  });

  it('выкидывает элемент с этим id', () => {
    expect(withoutId(list, 'b')).toEqual([
      { id: 'a', name: 'Аня' },
      { id: 'c', name: 'Вася' },
    ]);
  });

  it('id не найден — список возвращается без изменений', () => {
    expect(withoutId(list, 'z')).toEqual(list);
  });

  it('не мутирует входной массив', () => {
    const before = list.map((item) => ({ ...item }));
    withoutId(list, 'a');
    expect(list).toEqual(before);
  });

  it('возвращает новый массив, а не тот же объект', () => {
    expect(withoutId(list, 'z')).not.toBe(list);
  });
});

describe('appended', () => {
  it('null на входе — null на выходе', () => {
    expect(appended(null, { id: 'a', name: 'Аня' })).toBeNull();
  });

  it('добавляет элемент в конец, порядок остальных не меняет', () => {
    expect(appended(list, { id: 'd', name: 'Галя' })).toEqual([
      { id: 'a', name: 'Аня' },
      { id: 'b', name: 'Боря' },
      { id: 'c', name: 'Вася' },
      { id: 'd', name: 'Галя' },
    ]);
  });

  it('не мутирует входной массив', () => {
    const before = list.map((item) => ({ ...item }));
    appended(list, { id: 'd', name: 'Галя' });
    expect(list).toEqual(before);
    expect(list).toHaveLength(3);
  });

  it('возвращает новый массив, а не тот же объект', () => {
    expect(appended(list, { id: 'd', name: 'Галя' })).not.toBe(list);
  });
});
