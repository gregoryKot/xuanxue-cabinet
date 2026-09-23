// Разбор строки на текст и акценты `**жирным**` — чистая функция без DOM,
// тем же приёмом, что у promptLinks.ts: разбор и рендер разделены, чтобы
// границы кусков проверял юнит-тест, а не рендер компонента (CLAUDE.md
// «Тесты»).
//
// Маркер — не Markdown целиком (курсив, списки, заголовки): один приём под
// одну нужду, редкую акцентную строку в формулировке или тексте учителя
// (RichText.tsx, ADR-0043 — 600 у Golos Text это и есть «редкие акцентные
// строки» макета). Вложенности нет: внутри акцента `**` не ищем повторно —
// формулировка вопроса не редактор, а строка в одну руку.
// Не экспортируется: снаружи с маркером никто не работает — текст пишут
// звёздочками, а разбирает их эта функция (knip роняет CI на мёртвом
// экспорте, CLAUDE.md «Дубли и мёртвый код»).
const ACCENT_MARK = '**';

export interface TextAccentPart {
  text: string;
  /** Задан только у куска между парой маркеров — сами маркеры в `text` не
   * попадают. */
  accent?: true;
}

// Пустая пара `****` не даёт акцента: акцентировать нечего, а как текст
// строка так и остаётся видна пользователю — тот же принцип, что у
// непарного маркера ниже.
function isEmptyPair(closeIndex: number, openIndex: number): boolean {
  return closeIndex === openIndex + ACCENT_MARK.length;
}

/** Делит строку на куски обычного текста и акцентов; склейка полей `text`
 * всех кусков даёт исходную строку обратно (маркеры `**` снимаются только
 * у распознанной пары). */
export function splitTextAccents(input: string): TextAccentPart[] {
  const parts: TextAccentPart[] = [];
  // `cursor` — начало ещё не сложенного в куски текста; `searchFrom` —
  // откуда искать следующий маркер. Они расходятся, когда маркер оказался
  // непарным или пустым: искать дальше нужно правее него, а вот кусок
  // обычного текста перед ним ещё не закрыт и копится дальше как есть.
  let cursor = 0;
  let searchFrom = 0;

  while (searchFrom < input.length) {
    const openIndex = input.indexOf(ACCENT_MARK, searchFrom);
    if (openIndex === -1) break;

    const closeIndex = input.indexOf(ACCENT_MARK, openIndex + ACCENT_MARK.length);
    if (closeIndex === -1 || isEmptyPair(closeIndex, openIndex)) {
      searchFrom = openIndex + ACCENT_MARK.length;
      continue;
    }

    if (openIndex > cursor) parts.push({ text: input.slice(cursor, openIndex) });
    parts.push({
      text: input.slice(openIndex + ACCENT_MARK.length, closeIndex),
      accent: true,
    });
    cursor = closeIndex + ACCENT_MARK.length;
    searchFrom = cursor;
  }

  if (cursor < input.length) parts.push({ text: input.slice(cursor) });
  return parts;
}
