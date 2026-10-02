// Чистая логика «чей код бросил ошибку» (errorSource.ts, ADR-0071): без DOM,
// адрес страницы передаётся объектом.
import { describe, expect, it } from 'vitest';
import { isForeignScriptError } from './errorSource';

const PAGE = {
  origin: 'https://xuanxue.su',
  href: 'https://xuanxue.su/join/d5a4135acdd9d32b48fdec84c2c32f01',
};

describe('isForeignScriptError — filename события', () => {
  it('файл на нашем origin — наш код', () => {
    const source = {
      filename: `${PAGE.origin}/assets/index-abc.js`,
      error: new Error('x'),
    };

    expect(isForeignScriptError(source, PAGE)).toBe(false);
  });

  // Регрессия инцидента 2026-09-29: `Can't find variable: EmptyRanges`,
  // Safari 26.6, экран `/exams/:id` — бросило расширение, Safari прячет адрес
  // его скрипта под webkit-masked-url://hidden/, а текст отдаёт целиком.
  it('webkit-masked-url://hidden/ (расширение Safari) — чужой код', () => {
    const source = {
      filename: 'webkit-masked-url://hidden/',
      error: new ReferenceError("Can't find variable: EmptyRanges"),
    };

    expect(isForeignScriptError(source, PAGE)).toBe(true);
  });

  it('chrome-extension:// — чужой код', () => {
    const source = { filename: 'chrome-extension://abc/content.js', error: undefined };

    expect(isForeignScriptError(source, PAGE)).toBe(true);
  });

  it('скрипт с чужого домена — чужой код', () => {
    const source = { filename: 'https://cdn.example.com/x.js', error: undefined };

    expect(isForeignScriptError(source, PAGE)).toBe(true);
  });

  // Сравнение с `${origin}/`, а не с голым startsWith(origin): иначе адрес,
  // начинающийся с нашего домена, но принадлежащий чужому, сошёл бы за наш.
  it('домен, начинающийся с нашего origin (xuanxue.su.evil.com), — чужой код', () => {
    const source = { filename: 'https://xuanxue.su.evil.com/x.js', error: undefined };

    expect(isForeignScriptError(source, PAGE)).toBe(true);
  });

  it('origin с портом (локальная разработка) — наш код', () => {
    const source = { filename: 'http://localhost:3000/src/main.tsx', error: undefined };
    const localPage = { origin: 'http://localhost:3000', href: 'http://localhost:3000/' };

    expect(isForeignScriptError(source, localPage)).toBe(false);
  });

  it('непустой filename важнее стека: стек нашего кода не спасает чужой файл', () => {
    const error = new Error('x');
    error.stack = `Error: x\n    at run (${PAGE.origin}/assets/index-abc.js:1:2)`;
    const source = { filename: 'safari-web-extension://abc/content.js', error };

    expect(isForeignScriptError(source, PAGE)).toBe(true);
  });

  it('пустой filename (как у jsdom по умолчанию) отдаёт решение стеку', () => {
    const source = {
      filename: '',
      error: { stack: 'f@webkit-masked-url://hidden/:1:2' },
    };

    expect(isForeignScriptError(source, PAGE)).toBe(true);
  });
});

describe('isForeignScriptError — стек без filename', () => {
  it('стек Safari: первый кадр webkit-masked-url://hidden/ — чужой код', () => {
    const error = new ReferenceError("Can't find variable: EmptyRanges");
    error.stack = 'EmptyRangesUser@webkit-masked-url://hidden/:14677:28';

    expect(isForeignScriptError({ error }, PAGE)).toBe(true);
  });

  // Нативный кадр наверху — `JSON.parse` бросил из нашего кода: смотрим на
  // первый кадр с адресом, а не на самый верхний.
  it('стек Safari: нативный кадр наверху пропускается, дальше наш код', () => {
    const error = new SyntaxError('x');
    error.stack = `parse@[native code]\nload@${PAGE.origin}/assets/index-abc.js:1:200`;

    expect(isForeignScriptError({ error }, PAGE)).toBe(false);
  });

  it('стек Chrome: кадр нашего кода — наш код', () => {
    const error = new Error('x');
    error.stack = `Error: x\n    at run (${PAGE.origin}/assets/index-abc.js:1:2)`;

    expect(isForeignScriptError({ error }, PAGE)).toBe(false);
  });

  it('стек Chrome: кадр расширения без имени функции — чужой код', () => {
    const error = new TypeError('x');
    error.stack = 'TypeError: x\n    at chrome-extension://abc/content.js:3:4';

    expect(isForeignScriptError({ error }, PAGE)).toBe(true);
  });

  // Адрес в тексте сообщения, без `:строка:столбец` в конце, кадром не
  // считается: иначе сообщение о неудачной загрузке чужого файла объявило бы
  // нашу ошибку чужой.
  it('адрес в строке сообщения стека не принимается за кадр', () => {
    const error = new Error('не загрузилось https://cdn.example.com/x.js');
    error.stack = [
      'Error: не загрузилось https://cdn.example.com/x.js',
      `    at run (${PAGE.origin}/assets/a.js:1:2)`,
    ].join('\n');

    expect(isForeignScriptError({ error }, PAGE)).toBe(false);
  });

  // Ошибка из другого realm (скрипт расширения) не проходит instanceof Error
  // нашего окна, поэтому стек читается по форме объекта.
  it('объект не-Error со строкой stack (другой realm) читается по стеку', () => {
    const error = { message: 'x', stack: 'f@webkit-masked-url://hidden/:1:2' };

    expect(isForeignScriptError({ error }, PAGE)).toBe(true);
  });
});

describe('isForeignScriptError — источник не определить', () => {
  it('reason — строка без стека — отправляем', () => {
    expect(isForeignScriptError({ error: 'отказ' }, PAGE)).toBe(false);
  });

  it('reason — undefined — отправляем', () => {
    expect(isForeignScriptError({ error: undefined }, PAGE)).toBe(false);
  });

  it('reason — объект без stack — отправляем', () => {
    expect(isForeignScriptError({ error: { message: 'x' } }, PAGE)).toBe(false);
  });

  it('stack не строка — отправляем', () => {
    expect(isForeignScriptError({ error: { stack: 42 } }, PAGE)).toBe(false);
  });

  it('стек только из нативных кадров — отправляем', () => {
    const error = new Error('x');
    error.stack = 'forEach@[native code]\nat new Promise (<anonymous>)';

    expect(isForeignScriptError({ error }, PAGE)).toBe(false);
  });

  it('стек без адресов вообще — отправляем', () => {
    const error = new Error('x');
    error.stack = 'Error: x';

    expect(isForeignScriptError({ error }, PAGE)).toBe(false);
  });
});

// Регрессия инцидента 2026-10-02 (код обращения df76fa51-7a82-404e-ad36-15ebf0523271):
// Brave на iPhone выполнил код кошелька прямо в странице `/join/…`, и
// `TypeError: undefined is not an object (evaluating 'window.ethereum.selectedAddress
// = undefined')` пришёл владельцу как наш сбой. WebKit подписывает код приложения
// адресом документа — и в `filename`, и в кадре стека, — а CSP `script-src 'self'`
// гарантирует, что наш код живёт только в файлах скриптов.
describe('isForeignScriptError — код, выполненный прямо в странице', () => {
  const INJECTED = new TypeError(
    "undefined is not an object (evaluating 'window.ethereum.selectedAddress = undefined')",
  );

  it('filename равен адресу страницы — чужой код', () => {
    const source = { filename: PAGE.href, error: INJECTED };

    expect(isForeignScriptError(source, PAGE)).toBe(true);
  });

  // Путь `unhandledrejection`: filename нет, место броска — кадр стека Safari.
  it('стек Safari `global code@<адрес страницы>:1:35` без filename — чужой код', () => {
    const error = new TypeError(INJECTED.message);
    error.stack = `global code@${PAGE.href}:1:35`;

    expect(isForeignScriptError({ error }, PAGE)).toBe(true);
  });

  // `unhandledrejection` приходит позже броска: фрагмент успели убрать
  // (replaceState в useTelegramAuthResultLogin.ts) или поставить.
  it('другой фрагмент (#tgAuthResult=…) у того же адреса — чужой код', () => {
    const source = { filename: `${PAGE.href}#tgAuthResult=abc`, error: INJECTED };

    expect(isForeignScriptError(source, PAGE)).toBe(true);
  });

  it('у страницы фрагмент, у места броска его нет — чужой код', () => {
    const page = { ...PAGE, href: `${PAGE.href}#tgAuthResult=abc` };
    const source = { filename: PAGE.href, error: INJECTED };

    expect(isForeignScriptError(source, page)).toBe(true);
  });

  it('адрес страницы с query совпадает — чужой код', () => {
    const page = { ...PAGE, href: `${PAGE.href}?ref=tg` };
    const source = { filename: page.href, error: INJECTED };

    expect(isForeignScriptError(source, page)).toBe(true);
  });

  // Query — часть адреса документа: другой query — другое место, и правило его
  // не трогает (решает origin, как для любого адреса нашего домена).
  it('тот же путь с другим query — не адрес страницы, решает origin: наш код', () => {
    const page = { ...PAGE, href: `${PAGE.href}?ref=tg` };
    const source = { filename: `${PAGE.href}?ref=vk`, error: INJECTED };

    expect(isForeignScriptError(source, page)).toBe(false);
  });

  // Правило узкое: другой адрес на нашем origin под него не подпадает.
  it('другой адрес на нашем origin (/schedule при открытом /join/…) — наш код', () => {
    const source = { filename: `${PAGE.origin}/schedule`, error: INJECTED };

    expect(isForeignScriptError(source, PAGE)).toBe(false);
  });

  it('файл скрипта нашего origin на этой же странице — наш код', () => {
    const source = { filename: `${PAGE.origin}/assets/index-abc.js`, error: INJECTED };

    expect(isForeignScriptError(source, PAGE)).toBe(false);
  });
});
