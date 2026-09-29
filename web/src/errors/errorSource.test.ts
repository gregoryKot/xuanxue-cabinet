// Чистая логика «чей код бросил ошибку» (errorSource.ts, ADR-0071): без DOM,
// origin передаётся строкой.
import { describe, expect, it } from 'vitest';
import { isForeignScriptError } from './errorSource';

const ORIGIN = 'https://xuanxue.su';

describe('isForeignScriptError — filename события', () => {
  it('файл на нашем origin — наш код', () => {
    const source = { filename: `${ORIGIN}/assets/index-abc.js`, error: new Error('x') };

    expect(isForeignScriptError(source, ORIGIN)).toBe(false);
  });

  // Регрессия инцидента 2026-09-29: `Can't find variable: EmptyRanges`,
  // Safari 26.6, экран `/exams/:id` — бросило расширение, Safari прячет адрес
  // его скрипта под webkit-masked-url://hidden/, а текст отдаёт целиком.
  it('webkit-masked-url://hidden/ (расширение Safari) — чужой код', () => {
    const source = {
      filename: 'webkit-masked-url://hidden/',
      error: new ReferenceError("Can't find variable: EmptyRanges"),
    };

    expect(isForeignScriptError(source, ORIGIN)).toBe(true);
  });

  it('chrome-extension:// — чужой код', () => {
    const source = { filename: 'chrome-extension://abc/content.js', error: undefined };

    expect(isForeignScriptError(source, ORIGIN)).toBe(true);
  });

  it('скрипт с чужого домена — чужой код', () => {
    const source = { filename: 'https://cdn.example.com/x.js', error: undefined };

    expect(isForeignScriptError(source, ORIGIN)).toBe(true);
  });

  // Сравнение с `${origin}/`, а не с голым startsWith(origin): иначе адрес,
  // начинающийся с нашего домена, но принадлежащий чужому, сошёл бы за наш.
  it('домен, начинающийся с нашего origin (xuanxue.su.evil.com), — чужой код', () => {
    const source = { filename: 'https://xuanxue.su.evil.com/x.js', error: undefined };

    expect(isForeignScriptError(source, ORIGIN)).toBe(true);
  });

  it('origin с портом (локальная разработка) — наш код', () => {
    const source = { filename: 'http://localhost:3000/src/main.tsx', error: undefined };

    expect(isForeignScriptError(source, 'http://localhost:3000')).toBe(false);
  });

  it('непустой filename важнее стека: стек нашего кода не спасает чужой файл', () => {
    const error = new Error('x');
    error.stack = `Error: x\n    at run (${ORIGIN}/assets/index-abc.js:1:2)`;
    const source = { filename: 'safari-web-extension://abc/content.js', error };

    expect(isForeignScriptError(source, ORIGIN)).toBe(true);
  });

  it('пустой filename (как у jsdom по умолчанию) отдаёт решение стеку', () => {
    const source = {
      filename: '',
      error: { stack: 'f@webkit-masked-url://hidden/:1:2' },
    };

    expect(isForeignScriptError(source, ORIGIN)).toBe(true);
  });
});

describe('isForeignScriptError — стек без filename', () => {
  it('стек Safari: первый кадр webkit-masked-url://hidden/ — чужой код', () => {
    const error = new ReferenceError("Can't find variable: EmptyRanges");
    error.stack = 'EmptyRangesUser@webkit-masked-url://hidden/:14677:28';

    expect(isForeignScriptError({ error }, ORIGIN)).toBe(true);
  });

  // Нативный кадр наверху — `JSON.parse` бросил из нашего кода: смотрим на
  // первый кадр с адресом, а не на самый верхний.
  it('стек Safari: нативный кадр наверху пропускается, дальше наш код', () => {
    const error = new SyntaxError('x');
    error.stack = `parse@[native code]\nload@${ORIGIN}/assets/index-abc.js:1:200`;

    expect(isForeignScriptError({ error }, ORIGIN)).toBe(false);
  });

  it('стек Chrome: кадр нашего кода — наш код', () => {
    const error = new Error('x');
    error.stack = `Error: x\n    at run (${ORIGIN}/assets/index-abc.js:1:2)`;

    expect(isForeignScriptError({ error }, ORIGIN)).toBe(false);
  });

  it('стек Chrome: кадр расширения без имени функции — чужой код', () => {
    const error = new TypeError('x');
    error.stack = 'TypeError: x\n    at chrome-extension://abc/content.js:3:4';

    expect(isForeignScriptError({ error }, ORIGIN)).toBe(true);
  });

  // Адрес в тексте сообщения, без `:строка:столбец` в конце, кадром не
  // считается: иначе сообщение о неудачной загрузке чужого файла объявило бы
  // нашу ошибку чужой.
  it('адрес в строке сообщения стека не принимается за кадр', () => {
    const error = new Error('не загрузилось https://cdn.example.com/x.js');
    error.stack = [
      'Error: не загрузилось https://cdn.example.com/x.js',
      `    at run (${ORIGIN}/assets/a.js:1:2)`,
    ].join('\n');

    expect(isForeignScriptError({ error }, ORIGIN)).toBe(false);
  });

  // Ошибка из другого realm (скрипт расширения) не проходит instanceof Error
  // нашего окна, поэтому стек читается по форме объекта.
  it('объект не-Error со строкой stack (другой realm) читается по стеку', () => {
    const error = { message: 'x', stack: 'f@webkit-masked-url://hidden/:1:2' };

    expect(isForeignScriptError({ error }, ORIGIN)).toBe(true);
  });
});

describe('isForeignScriptError — источник не определить', () => {
  it('reason — строка без стека — отправляем', () => {
    expect(isForeignScriptError({ error: 'отказ' }, ORIGIN)).toBe(false);
  });

  it('reason — undefined — отправляем', () => {
    expect(isForeignScriptError({ error: undefined }, ORIGIN)).toBe(false);
  });

  it('reason — объект без stack — отправляем', () => {
    expect(isForeignScriptError({ error: { message: 'x' } }, ORIGIN)).toBe(false);
  });

  it('stack не строка — отправляем', () => {
    expect(isForeignScriptError({ error: { stack: 42 } }, ORIGIN)).toBe(false);
  });

  it('стек только из нативных кадров — отправляем', () => {
    const error = new Error('x');
    error.stack = 'forEach@[native code]\nat new Promise (<anonymous>)';

    expect(isForeignScriptError({ error }, ORIGIN)).toBe(false);
  });

  it('стек без адресов вообще — отправляем', () => {
    const error = new Error('x');
    error.stack = 'Error: x';

    expect(isForeignScriptError({ error }, ORIGIN)).toBe(false);
  });
});
