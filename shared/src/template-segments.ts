// Разбор шаблона на литералы и необязательные фрагменты `[ … ]` — первый шаг
// рендера (templates.ts), до подстановки значений.

type Segment =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'fragment'; readonly inner: string };

/** Разбивает шаблон на литералы и необязательные фрагменты `[ … ]` по
 * исходному тексту шаблона. Вложенные скобки не поддерживаются: `[` берёт
 * себе ближайшую следующую `]`, а более ранняя внутренняя `[` остаётся
 * обычным символом внутри фрагмента; `[` без `]` до конца строки — тоже
 * обычный символ (см. тест «вложенная скобка»).
 *
 * Если `]` для очередной `[` не нашлась — её нет и дальше по строке (только
 * что просканированный `indexOf` уже сузил остаток), поэтому весь хвост
 * шаблона отдаётся одним `text`-сегментом без изменения поведения. Раньше
 * цикл продолжал идти по символам и на каждой следующей `[` пересканировал
 * тот же хвост заново — O(n²) на `'['.repeat(n)` (аудит 2026-09-12, M9:
 * 100k символов — 56 мс, 400k — 882 мс). */
export function parseSegments(template: string): Segment[] {
  const segments: Segment[] = [];
  let textStart = 0;
  let i = 0;
  while (i < template.length) {
    if (template[i] === '[') {
      const closeIndex = template.indexOf(']', i + 1);
      if (closeIndex !== -1) {
        if (i > textStart)
          segments.push({ kind: 'text', value: template.slice(textStart, i) });
        segments.push({ kind: 'fragment', inner: template.slice(i + 1, closeIndex) });
        i = closeIndex + 1;
        textStart = i;
        continue;
      }
      break;
    }
    i += 1;
  }
  if (textStart < template.length)
    segments.push({ kind: 'text', value: template.slice(textStart) });
  return segments;
}
