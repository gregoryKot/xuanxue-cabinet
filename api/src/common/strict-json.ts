// Строгий разбор JSON для тел, где повтор ключа — ошибка клиента (ADR-0185).
// `JSON.parse` молча оставляет последнее значение повторяющегося ключа, и
// `{"selected":true,"selected":false}` читается по-разному у клиента и у
// сервера; здесь повтор в любом объекте, на любой глубине, отклоняется.
// Ключи сравниваются после раскрытия escape-последовательностей: `"a"` и
// `"\u0061"` — один и тот же ключ.
//
// Разбор написан вручную, а не сверкой текста после `JSON.parse`: так
// грамматика одна и та же для разбора и для проверки повторов, и расходиться им
// не с чем. Модуль чистый — без Nest и без сети, тест рядом.

/** Глубже вложенность не нужна ни одному телу API, а рекурсивный разбор на
 * мегабайте скобок `[[[[…` иначе падал бы переполнением стека — 500 вместо 400. */
const MAX_DEPTH = 64;
const NUMBER_RE = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const HEX4_RE = /^[0-9a-fA-F]{4}$/;
const WHITESPACE = new Set([' ', '\t', '\n', '\r']);
const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};
const LITERALS: Readonly<Record<string, boolean | null>> = {
  true: true,
  false: false,
  null: null,
};

export type StrictJsonFailure = 'syntax' | 'duplicate_key';

export class StrictJsonError extends Error {
  constructor(
    readonly failure: StrictJsonFailure,
    detail: string,
  ) {
    super(detail);
    this.name = 'StrictJsonError';
  }
}

class Reader {
  private pos = 0;

  constructor(private readonly text: string) {}

  parseDocument(): unknown {
    this.skipWhitespace();
    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.pos < this.text.length) this.fail('syntax', 'лишние знаки после значения');
    return value;
  }

  private fail(failure: StrictJsonFailure, detail: string): never {
    throw new StrictJsonError(failure, `${detail} (позиция ${this.pos})`);
  }

  private skipWhitespace(): void {
    while (WHITESPACE.has(this.text[this.pos] ?? '')) this.pos += 1;
  }

  private expect(char: string): void {
    if (this.text[this.pos] !== char) this.fail('syntax', `ожидалось «${char}»`);
    this.pos += 1;
  }

  private parseValue(depth: number): unknown {
    if (depth > MAX_DEPTH) this.fail('syntax', 'слишком глубокая вложенность');
    const char = this.text[this.pos];
    if (char === '{') return this.parseObject(depth);
    if (char === '[') return this.parseArray(depth);
    if (char === '"') return this.parseString();
    if (char === '-' || (char !== undefined && char >= '0' && char <= '9')) {
      return this.parseNumber();
    }
    return this.parseLiteral();
  }

  private parseLiteral(): boolean | null {
    for (const [word, value] of Object.entries(LITERALS)) {
      if (this.text.startsWith(word, this.pos)) {
        this.pos += word.length;
        return value;
      }
    }
    return this.fail('syntax', 'неизвестное значение');
  }

  private parseNumber(): number {
    NUMBER_RE.lastIndex = this.pos;
    const match = NUMBER_RE.exec(this.text);
    if (!match) this.fail('syntax', 'неверное число');
    this.pos += match[0].length;
    return Number(match[0]);
  }

  private parseString(): string {
    this.expect('"');
    let result = '';
    for (;;) {
      const char = this.text[this.pos];
      if (char === undefined) this.fail('syntax', 'строка не закрыта');
      this.pos += 1;
      if (char === '"') return result;
      if (char === '\\') {
        result += this.parseEscape();
      } else if (char < ' ') {
        this.fail('syntax', 'управляющий знак в строке');
      } else {
        result += char;
      }
    }
  }

  private parseEscape(): string {
    const code = this.text[this.pos];
    this.pos += 1;
    if (code === 'u') {
      const hex = this.text.slice(this.pos, this.pos + 4);
      if (!HEX4_RE.test(hex)) this.fail('syntax', 'неверная последовательность \\u');
      this.pos += 4;
      return String.fromCharCode(parseInt(hex, 16));
    }
    const simple = code === undefined ? undefined : SIMPLE_ESCAPES[code];
    if (simple === undefined) this.fail('syntax', 'неверная escape-последовательность');
    return simple;
  }

  private parseArray(depth: number): unknown[] {
    this.expect('[');
    const items: unknown[] = [];
    this.skipWhitespace();
    if (this.text[this.pos] === ']') {
      this.pos += 1;
      return items;
    }
    for (;;) {
      this.skipWhitespace();
      items.push(this.parseValue(depth + 1));
      this.skipWhitespace();
      if (this.text[this.pos] === ',') {
        this.pos += 1;
        continue;
      }
      this.expect(']');
      return items;
    }
  }

  private parseObject(depth: number): Record<string, unknown> {
    this.expect('{');
    // Без прототипа: ключ `__proto__` остаётся обычным собственным полем, как у
    // `JSON.parse`, и не задевает `Object.prototype`.
    const object: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    this.skipWhitespace();
    if (this.text[this.pos] === '}') {
      this.pos += 1;
      return object;
    }
    for (;;) {
      this.skipWhitespace();
      const key = this.parseString();
      if (Object.hasOwn(object, key)) this.fail('duplicate_key', 'ключ повторяется');
      this.skipWhitespace();
      this.expect(':');
      this.skipWhitespace();
      object[key] = this.parseValue(depth + 1);
      this.skipWhitespace();
      if (this.text[this.pos] === ',') {
        this.pos += 1;
        continue;
      }
      this.expect('}');
      return object;
    }
  }
}

/** Разбирает текст JSON; бросает `StrictJsonError` на синтаксис и на повтор
 * ключа. Объекты в результате — без прототипа. */
export function parseStrictJson(text: string): unknown {
  return new Reader(text).parseDocument();
}
