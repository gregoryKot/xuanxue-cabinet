// Разбор строки формулировки на текст и ссылки (ADR-0093) — чистая функция
// без DOM: RichText.tsx только раскладывает результат по <a> и тексту, а
// сам разбор проверяют юниты, без рендера (CLAUDE.md «Тесты»).
//
// Ссылкой признаём http://, https:// и Telegram-ник: формулировку пишет учитель, а
// открывает её ученик, и превращать чужую строку в исполняемый переход по
// схеме javascript:/data: нельзя — тот же принцип, что у CSP (SECURITY.md
// §7, ADR-0093). Регулярное выражение ищет ровно эти два префикса, поэтому
// остальные схемы попасть в него не могут вообще, без отдельного списка
// запрещённых. Ник (`@username`) ссылкой тоже становится, но href для него
// собираем сами, см. TELEGRAM_HANDLE_RE ниже.
const URL_RE = /\bhttps?:\/\/\S+/g;

// Пунктуация конца предложения на конце найденного адреса — не часть
// ссылки: «…посмотрите https://ya.ru/v.» не должна утаскивать точку внутрь
// href.
const SENTENCE_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', '"', "'"]);

// Закрывающая скобка остаётся в ссылке, только если внутри неё есть парная
// открывающая (адрес со скобками в пути, например статья википедии) —
// иначе она отрезается вместе с пунктуацией.
const CLOSING_TO_OPENING: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

function countChar(text: string, char: string): number {
  return text.split(char).length - 1;
}

// Саму схему (`http://`/`https://`) отрезать не может: `/` не входит ни в
// один из наборов выше и всегда останавливает цикл раньше, чем он дойдёт до
// двоеточия схемы.
function trimTrailingPunctuation(rawUrl: string): string {
  let end = rawUrl.length;
  while (end > 0) {
    const char = rawUrl.charAt(end - 1);
    if (SENTENCE_PUNCTUATION.has(char)) {
      end -= 1;
      continue;
    }
    const opening = CLOSING_TO_OPENING[char];
    if (opening !== undefined) {
      const candidate = rawUrl.slice(0, end);
      if (countChar(candidate, char) > countChar(candidate, opening)) {
        end -= 1;
        continue;
      }
    }
    break;
  }
  return rawUrl.slice(0, end);
}

// Telegram-ник: 5–32 знака `[A-Za-z0-9_]` (правила самого Telegram). Ссылка
// безопасна, потому что href мы не берём из текста, а собираем из ника,
// прошедшего эту проверку, и схема всегда `https://t.me/` (ADR-0159): ни
// javascript:, ни чужого хоста через ник не пронести. Общий механизм, а не
// правка одной строки: любой ник в тексте учителя (подсказка, формулировка,
// контакт школы) ведёт в тот же чат, отдельного компонента «ник» не нужно.
// Перед `@` не должно быть буквы, цифры, `_`, `.`, `/` и `@`: так почта
// `name@mail.ru` и путь в адресе остаются текстом. Хвостовая точка или
// запятая в ник не входят — их нет в классе символов; за ником не должно
// идти буквы или цифры, иначе это не ник, а начало другого слова.
const TELEGRAM_HANDLE_RE =
  /(?<![\p{L}\p{N}_./@])@([A-Za-z0-9_]{5,32})(?![\p{L}\p{N}_])/gu;
const TELEGRAM_LINK_BASE = 'https://t.me/';

export interface PromptTextPart {
  text: string;
  /** Задан только у распознанной ссылки — совпадает с текстом куска. */
  href?: string;
}

// Схема без хоста — не ссылка, а слово в тексте: «адрес должен начинаться с
// https://.» — тут кликать не на что, и `<a href="https://">` вёл бы в
// никуда. Раньше такой текст до разбора не доходил вовсе, а с ADR-0124
// ошибки формы поехали через RichText, и ошибка валидации сайта школы
// («должна начинаться с https://.», templates/SchoolSiteField.tsx) стала
// наполовину ссылкой (найдено 2026-09-23, тест ниже).
function hasHost(url: string): boolean {
  return url.slice(url.indexOf('//') + 2).length > 0;
}

// Ники ищем только в кусках текста между адресами: `@` внутри http(s)-ссылки
// (`https://t.me/@x`, `?u=@name`) остаётся частью адреса.
function splitTelegramHandles(text: string): PromptTextPart[] {
  const parts: PromptTextPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(TELEGRAM_HANDLE_RE)) {
    const start = match.index;
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    parts.push({ text: match[0], href: `${TELEGRAM_LINK_BASE}${match[1] ?? ''}` });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}

function splitUrls(input: string): PromptTextPart[] {
  const parts: PromptTextPart[] = [];
  let cursor = 0;
  URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(input)) !== null) {
    const start = match.index;
    const url = trimTrailingPunctuation(input.slice(start, URL_RE.lastIndex));
    if (!hasHost(url)) {
      // Дальше ищем сразу за голой схемой: длина у неё всегда больше нуля,
      // поэтому цикл двигается и не зацикливается.
      URL_RE.lastIndex = start + url.length;
      continue;
    }
    if (start > cursor) parts.push({ text: input.slice(cursor, start) });
    parts.push({ text: url, href: url });
    cursor = start + url.length;
  }
  if (cursor < input.length) parts.push({ text: input.slice(cursor) });
  return parts;
}

/** Делит строку формулировки на куски текста и ссылок (http(s)-адрес,
 * Telegram-ник) по порядку строки; склейка полей `text` всех кусков даёт
 * исходную строку обратно. Адрес разбирается первым, ник — в остатке. */
export function splitPromptLinks(input: string): PromptTextPart[] {
  return splitUrls(input).flatMap((part) =>
    part.href ? [part] : splitTelegramHandles(part.text),
  );
}
