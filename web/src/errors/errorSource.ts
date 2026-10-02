// Чей код бросил ошибку: наш или чужой (ADR-0071).
//
// Инцидент 2026-09-29: в Telegram владельцу пришёл «Сбой в браузере» с текстом
// `Can't find variable: EmptyRanges` (Safari, экран `/exams/:id`). Такого имени
// нет ни в исходниках, ни в зависимостях, ни в собранном бандле — бросило
// расширение Safari. Фильтр `'Script error.'` (globalErrorReporting.ts) его не
// остановил: он рассчитан на скрипт с чужого origin, у которого браузер прячет
// текст по CORS, а Safari отдаёт текст расширения целиком и прячет только адрес
// скрипта — `webkit-masked-url://hidden/`. Так он выглядит и в `filename`
// события, и в кадрах `Error.stack`.
//
// Поэтому смотрим не на текст, а на место броска и сверяем его с адресом
// кабинета. CSP разрешает `script-src 'self'` (api/src/security/csp.ts), других
// скриптов у страницы нет (recorder PostHog приезжает импортом в наш бандл),
// значит всё, что бросил не наш origin, починить в кабинете нельзя.
//
// Инцидент 2026-10-02: «Сбой в браузере» с `/join/…`, текст `undefined is not an
// object (evaluating 'window.ethereum.selectedAddress = undefined')`, Brave на
// iPhone. `ethereum` в кабинете нет нигде — приложение выполнило код кошелька
// прямо в странице (WKWebView `evaluateJavaScript`). Мимо фильтра он прошёл
// потому, что WebKit подписывает такой код адресом самого документа, если
// приложение не дало свой sourceURL: и `filename`, и кадры стека
// (`global code@https://xuanxue.su/join/…:1:35`) начинаются с нашего origin.
// Поэтому место броска, равное адресу самой страницы, — тоже чужой код. Это
// безопасно из-за той же CSP: ни `'unsafe-inline'`, ни `'unsafe-eval'`, значит
// инлайн-скриптов, обработчиков-атрибутов и строкового `setTimeout` у страницы
// нет, весь наш код — в файлах `/assets/*.js`. «Кодом из адреса страницы»
// бывает только то, что впрыснул браузер или приложение, и чинить нечего.
//
// Обратный выбор — если место броска не определить (нет ни `filename`, ни
// кадра с адресом), ошибка считается нашей и уходит отчётом: лишний отчёт
// дешевле потерянного, а тихий отказ в этом продукте — самая дорогая ошибка.

/** Адрес страницы: `window.location` подходит как есть. */
export interface PageLocation {
  origin: string;
  href: string;
}

export interface ErrorSource {
  /** `ErrorEvent.filename` — у события `unhandledrejection` его нет. */
  filename?: string;
  /** `event.error` или `event.reason` — что угодно, не только Error. */
  error: unknown;
}

// Кадр стека с адресом скрипта, строкой и столбцом в конце: `fn@url:1:2` и
// `url:1:2` (Safari, Firefox), `at fn (url:1:2)` и `at url:1:2` (Chrome).
// Группа 1 — адрес без `:строка:столбец`. Привязка к концу строки нужна, чтобы
// не принять за кадр строку сообщения («Error: не загрузилось https://…/x.js»),
// а нативные кадры (`forEach@[native code]`, `at new Promise (<anonymous>)`)
// под неё не подходят вовсе.
const STACK_FRAME_URL = /([a-z][a-z\d+.-]*:\/\/[^\s()]*?):\d+:\d+\)?$/i;

/** Стек читаем утиной типизацией, не `instanceof Error`: ошибка из другого
 * realm (скрипт расширения) `instanceof Error` нашего окна не проходит. */
function readStack(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { stack } = error as { stack?: unknown };
  return typeof stack === 'string' ? stack : undefined;
}

/** Адрес скрипта из первого кадра стека, у которого он есть: нативный кадр
 * наверху (`JSON.parse` бросил из нашего кода) пропускается. */
function findThrowingUrl(stack: string): string | undefined {
  for (const line of stack.split('\n')) {
    const match = STACK_FRAME_URL.exec(line.trim());
    if (match?.[1]) return match[1];
  }
  return undefined;
}

/** Адрес без фрагмента: у документа он входит в адрес, а `unhandledrejection`
 * приходит позже броска, и фрагмент мог смениться (`replaceState` в
 * useTelegramAuthResultLogin.ts убирает `#tgAuthResult=`). Query остаётся —
 * это часть адреса документа. */
function withoutFragment(url: string): string {
  const hash = url.indexOf('#');
  return hash === -1 ? url : url.slice(0, hash);
}

/** `true` — место, где брошена ошибка, точно не наш код (расширение браузера,
 * скрипт с чужого домена, код, впрыснутый приложением в страницу) и отчёт о ней
 * владельцу не нужен. `false` — наш код либо источник определить не удалось.
 * Сравнение с `${origin}/`, а не с голым `origin`: иначе
 * `https://xuanxue.su.evil.com` сошёл бы за наш. */
export function isForeignScriptError(source: ErrorSource, page: PageLocation): boolean {
  // Непустой `filename` браузер уже выбрал сам — это первый не-нативный кадр.
  const url = source.filename || findThrowingUrl(readStack(source.error) ?? '');
  if (!url) return false;
  // Узкое правило: только адрес самой страницы. Другой адрес на нашем origin
  // (`/schedule` при открытом `/join/…`) решает проверка origin ниже.
  if (withoutFragment(url) === withoutFragment(page.href)) return true;
  return !url.startsWith(`${page.origin}/`);
}
