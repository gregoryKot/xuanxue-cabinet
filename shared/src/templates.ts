// Подстановки в шаблонах постов (docs/adr/0011-template-syntax.md,
// docs/PLAN.md §6): plain text, подстановка только по allow-list имён,
// никакого eval — docs/SECURITY.md §4 «текст шаблона — данные».
//
// Рендер однопроходный: шаблон разбирается на литералы, необязательные
// фрагменты `[ … ]` и плейсхолдеры `{имя}` ДО подстановки значений —
// значения вставляются как есть и повторно не сканируются. Если разбирать
// после подстановки (или одной последовательной заменой), значение со
// скобками или фигурными скобками («Комплекс [24 формы]», текст с
// `{пароль}`) исказило бы разметку — см. templates.spec.ts.

/** Допустимые имена подстановок в шаблоне поста (PLAN.md §6). */
export const TEMPLATE_PLACEHOLDERS = [
  'название',
  'тема',
  'группа',
  'ссылка',
  'пароль',
  'время',
  'минут',
  'ведущий',
  'длительность',
] as const;

export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number];

/** Значения для подстановки; отсутствующий ключ — плейсхолдер пуст. */
export type TemplateValues = Partial<
  Record<TemplatePlaceholder, string | number | null | undefined>
>;

const PLACEHOLDER_ALLOW_LIST = new Set<string>(TEMPLATE_PLACEHOLDERS);

// Рендер знает только строгое имя: без пробелов и без вложенных `{`/`}`.
const PLACEHOLDER_RE = /\{([^{}\s]+)\}/g;
// Валидация формы, наоборот, смотрит на любые фигурные скобки с содержимым:
// `{ название }` с пробелом (автокоррекция телефона) рендер не подставит, и
// учитель должен увидеть это в форме, а не в канале.
const ANY_BRACES_RE = /\{([^{}]+)\}/g;

function isKnownPlaceholder(name: string): name is TemplatePlaceholder {
  return PLACEHOLDER_ALLOW_LIST.has(name);
}

/** Значение в текст: число — строкой, пустая/пробельная строка, null и
 * undefined — пустая строка. */
function toDisplayValue(value: string | number | null | undefined): string {
  if (typeof value === 'number') return String(value);
  if (value === null || value === undefined || value.trim() === '') return '';
  return value;
}

function isValueEmpty(value: string | number | null | undefined): boolean {
  return toDisplayValue(value) === '';
}

/** Подставляет известные плейсхолдеры в кусок текста; неизвестный остаётся
 * буквально — его проверяет findUnknownPlaceholders, не рендер. */
function substitutePlaceholders(text: string, values: TemplateValues): string {
  return text.replace(PLACEHOLDER_RE, (match: string, name: string): string => {
    if (!isKnownPlaceholder(name)) return match;
    return toDisplayValue(values[name]);
  });
}

/** Фрагмент пуст, если в нём нет ни одного `{…}`, или все найденные — это
 * известные плейсхолдеры с пустым значением. Неизвестный плейсхолдер
 * значения не имеет, но остаётся текстом — поэтому сам по себе делает
 * фрагмент непустым (см. тест `'[{дата}]'`). */
function isFragmentEmpty(inner: string, values: TemplateValues): boolean {
  const matches = [...inner.matchAll(PLACEHOLDER_RE)];
  if (matches.length === 0) return true;
  return matches.every((match) => {
    const name = match[1] ?? '';
    return isKnownPlaceholder(name) && isValueEmpty(values[name]);
  });
}

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
function parseSegments(template: string): Segment[] {
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

/**
 * Рендер поста по шаблону: `{имя}` из allow-list `TEMPLATE_PLACEHOLDERS` и
 * необязательные фрагменты `[ … ]` — фрагмент без единого `{…}` пуст по
 * определению и исчезает вместе со скобками; фрагмент с плейсхолдером,
 * который остался пустым, тоже исчезает. Возвращает plain text без
 * экранирования: адаптер канала шлёт его без parse_mode (docs/PLAN.md §6,
 * п. 6 «Шаблоны»).
 */
export function renderTemplate(template: string, values: TemplateValues): string {
  return parseSegments(template)
    .map((segment) => {
      if (segment.kind === 'text') return substitutePlaceholders(segment.value, values);
      if (isFragmentEmpty(segment.inner, values)) return '';
      return substitutePlaceholders(segment.inner, values);
    })
    .join('');
}

/** Имена `{…}`, которых нет в allow-list, без дублей, в порядке появления —
 * для сообщения формы «{дата} не поддерживается». */
export function findUnknownPlaceholders(template: string): string[] {
  const found: string[] = [];
  for (const match of template.matchAll(ANY_BRACES_RE)) {
    const name = match[1] ?? '';
    if (!isKnownPlaceholder(name) && !found.includes(name)) {
      found.push(name);
    }
  }
  return found;
}
