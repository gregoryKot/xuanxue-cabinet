// Строгий разбор JSON: тот же результат, что у JSON.parse на верном тексте, и
// отказ на повторе ключа в любом объекте на любой глубине (ADR-0185).
import { parseStrictJson, StrictJsonError } from './strict-json';

function failureOf(text: string): string | undefined {
  try {
    parseStrictJson(text);
  } catch (err) {
    if (err instanceof StrictJsonError) return err.failure;
    throw err;
  }
  return undefined;
}

/** Объекты без прототипа сравниваются по содержимому, а не по `Object.prototype`. */
function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('parseStrictJson: верный JSON читается как JSON.parse', () => {
  it.each([
    ['{}'],
    ['[]'],
    ['null'],
    ['true'],
    ['false'],
    ['0'],
    ['-12.5e+3'],
    ['1E2'],
    ['"строка"'],
    ['"\\"\\\\\\/\\b\\f\\n\\r\\t"'],
    ['"\\u0041\\u00e9\\ud83d\\ude00"'],
    ['{"a":1,"b":[1,2,{"c":null}],"d":{"e":{"f":"g"}}}'],
    ['[{"a":1},{"a":2},{"a":3}]'],
    [' \t\r\n{ "a" : [ 1 , 2 ] }\n '],
    ['{"":1}'],
    ['{"a":{"a":{"a":1}}}'],
    ['[[],[[]],{}]'],
  ])('%s', (text) => {
    expect(plain(parseStrictJson(text))).toEqual(JSON.parse(text));
  });

  it('«-0» остаётся минус нулём, как у JSON.parse', () => {
    expect(Object.is(parseStrictJson('-0'), -0)).toBe(true);
  });

  it('безопасные для тела запроса объекты — без прототипа, __proto__ — обычное поле', () => {
    const parsed = parseStrictJson('{"__proto__":{"polluted":true},"a":1}') as Record<
      string,
      unknown
    >;

    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect(Object.keys(parsed)).toEqual(['__proto__', 'a']);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('одинаковые ключи в разных объектах — не повтор', () => {
    expect(failureOf('{"a":{"a":1},"b":{"a":2}}')).toBeUndefined();
    expect(failureOf('[{"a":1},{"a":1}]')).toBeUndefined();
  });
});

describe('parseStrictJson: повтор ключа', () => {
  it.each([
    ['на верхнем уровне', '{"a":1,"a":2}'],
    ['одинаковое значение тоже повтор', '{"a":1,"a":1}'],
    ['не подряд', '{"a":1,"b":2,"a":3}'],
    ['во вложенном объекте', '{"x":{"a":1,"a":2}}'],
    ['глубоко', '{"x":{"y":{"z":{"a":1,"a":2}}}}'],
    ['в объекте внутри массива', '[{"a":1},{"b":1,"b":2}]'],
    ['в массиве массивов', '[[{"k":1,"k":2}]]'],
    ['после вложенного значения', '{"a":{"b":1},"a":2}'],
    ['пустой ключ', '{"":1,"":2}'],
    ['ключ и его escape: \\u0061', '{"a":1,"\\u0061":2}'],
    ['escape и ключ: \\u0061', '{"\\u0061":1,"a":2}'],
    ['два escape одного ключа', '{"\\u0061":1,"\\u0061":2}'],
    ['регистр hex в \\u', '{"\\u00e9":1,"\\u00E9":2}'],
    ['\\n и \\u000a', '{"\\n":1,"\\u000a":2}'],
    ['\\/ и /', '{"a/b":1,"a\\/b":2}'],
    ['суррогатная пара и escape-пара', '{"\\ud83d\\ude00":1,"\\ud83d\\ude00":2}'],
    ['__proto__', '{"__proto__":1,"__proto__":2}'],
  ])('%s', (_name, text) => {
    expect(failureOf(text)).toBe('duplicate_key');
  });

  it('разные ключи, похожие после escape, повтором не считаются', () => {
    expect(failureOf('{"a":1,"\\u0062":2,"A":3,"\\\\u0061":4}')).toBeUndefined();
  });
});

describe('parseStrictJson: синтаксические ошибки', () => {
  it.each([
    [''],
    ['   '],
    ['{'],
    ['}'],
    ['[1,]'],
    ['{"a":1,}'],
    ['{"a" 1}'],
    ['{a:1}'],
    ["{'a':1}"],
    ['{"a":1 "b":2}'],
    ['[1 2]'],
    ['{"a":1}{"b":2}'],
    ['{"a":1} x'],
    ['01'],
    ['1.'],
    ['.5'],
    ['+1'],
    ['-'],
    ['1e'],
    ['NaN'],
    ['Infinity'],
    ['undefined'],
    ['nul'],
    ['"abc'],
    ['"\\x"'],
    ['"\\u12"'],
    ['"\\u12G4"'],
    ['"a\nb"'],
    ['"a\tb"'],
    ['\uFEFF{}'],
    ['{"a":1}\u00a0'],
    ['// c\n{}'],
  ])('%j — syntax', (text) => {
    expect(failureOf(text)).toBe('syntax');
  });

  it('вложенность выше потолка — syntax, а не переполнение стека', () => {
    const depth = 200_000;

    expect(failureOf('['.repeat(depth) + ']'.repeat(depth))).toBe('syntax');
    expect(failureOf('{"a":'.repeat(depth))).toBe('syntax');
  });

  it('вложенность на потолке ещё читается', () => {
    const depth = 64;

    expect(failureOf('['.repeat(depth) + ']'.repeat(depth))).toBeUndefined();
  });

  it('ошибка называет позицию, но не вставляет в сообщение сам текст', () => {
    try {
      parseStrictJson('{"секрет":1,"секрет":2}');
      throw new Error('должно упасть');
    } catch (err) {
      expect((err as Error).message).toMatch(/позиция \d+/);
      expect((err as Error).message).not.toContain('секрет');
    }
  });
});
