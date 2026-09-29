// Подстановки в шаблонах постов (docs/adr/0011-template-syntax.md,
// docs/PLAN.md §6): plain text, подстановка только по allow-list имён,
// никакого eval — docs/SECURITY.md §4 «текст шаблона — данные».
//
// Рендер однопроходный: шаблон разбирается на литералы, необязательные
// фрагменты `[ … ]` и плейсхолдеры `{имя}` ДО подстановки значений —
// значения вставляются как есть и повторно не сканируются. Если разбирать
// после подстановки (или одной последовательной заменой), значение со
// скобками или фигурными скобками («Комплекс [24 формы]», текст с
// `{пароль}`) исказило бы разметку — см. templates.spec.ts. Разбор на
// сегменты вынесен в template-segments.ts (файл-лимит 150 строк).
import { parseSegments } from './template-segments';

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

/** Допустимые имена подстановок в напоминании об оплате (ADR-0051): личное
 * сообщение ученику, поэтому `{ведущий}`/`{пароль}` из поста здесь
 * бессмысленны, а `{месяц}`/`{сумма}`/`{имя}` в посте — наоборот. `{контакт}` —
 * кому присылать скриншот перевода (настройка школы `paymentContact`,
 * ADR-0159). */
export const PAYMENT_REMINDER_PLACEHOLDERS = [
  'месяц',
  'сумма',
  'имя',
  'ссылка',
  'контакт',
] as const;

type PlaceholderValue = string | number | null | undefined;

/** Значения для подстановки; отсутствующий ключ — плейсхолдер пуст. Имена
 * ключей — из allow-list шаблона (по умолчанию — поста): у напоминания об
 * оплате свой набор, тип подстановки тот же. */
export type TemplateValues<Name extends string = TemplatePlaceholder> = Partial<
  Record<Name, PlaceholderValue>
>;

// Рендер знает только строгое имя: без пробелов и без вложенных `{`/`}`.
const PLACEHOLDER_RE = /\{([^{}\s]+)\}/g;
// Валидация формы, наоборот, смотрит на любые фигурные скобки с содержимым:
// `{ название }` с пробелом (автокоррекция телефона) рендер не подставит, и
// учитель должен увидеть это в форме, а не в канале.
const ANY_BRACES_RE = /\{([^{}]+)\}/g;

function isKnownPlaceholder(name: string, allowList: readonly string[]): boolean {
  return allowList.includes(name);
}

/** Значение в текст: число — строкой, пустая/пробельная строка, null и
 * undefined — пустая строка. */
function toDisplayValue(value: PlaceholderValue): string {
  if (typeof value === 'number') return String(value);
  if (value === null || value === undefined || value.trim() === '') return '';
  return value;
}

function isValueEmpty(value: PlaceholderValue): boolean {
  return toDisplayValue(value) === '';
}

/** Подставляет известные плейсхолдеры в кусок текста; неизвестный остаётся
 * буквально — его проверяет findUnknownPlaceholders, не рендер. */
function substitutePlaceholders(
  text: string,
  values: Partial<Record<string, PlaceholderValue>>,
  allowList: readonly string[],
): string {
  return text.replace(PLACEHOLDER_RE, (match: string, name: string): string => {
    if (!isKnownPlaceholder(name, allowList)) return match;
    return toDisplayValue(values[name]);
  });
}

/** Фрагмент пуст, если в нём нет ни одного `{…}`, или все найденные — это
 * известные плейсхолдеры с пустым значением. Неизвестный плейсхолдер
 * значения не имеет, но остаётся текстом — поэтому сам по себе делает
 * фрагмент непустым (см. тест `'[{дата}]'`). */
function isFragmentEmpty(
  inner: string,
  values: Partial<Record<string, PlaceholderValue>>,
  allowList: readonly string[],
): boolean {
  const matches = [...inner.matchAll(PLACEHOLDER_RE)];
  if (matches.length === 0) return true;
  return matches.every((match) => {
    const name = match[1] ?? '';
    return isKnownPlaceholder(name, allowList) && isValueEmpty(values[name]);
  });
}

/**
 * Рендер по шаблону: `{имя}` из allow-list (по умолчанию — поста,
 * `TEMPLATE_PLACEHOLDERS`; у напоминания об оплате — свой,
 * `PAYMENT_REMINDER_PLACEHOLDERS`, ADR-0051) и необязательные фрагменты
 * `[ … ]` — фрагмент без единого `{…}` пуст по определению и исчезает вместе
 * со скобками; фрагмент с плейсхолдером, который остался пустым, тоже
 * исчезает. Возвращает plain text без экранирования: адаптер канала шлёт его
 * без parse_mode (docs/PLAN.md §6, п. 6 «Шаблоны»).
 */
export function renderTemplate(template: string, values: TemplateValues): string;
export function renderTemplate<Name extends string>(
  template: string,
  values: TemplateValues<Name>,
  allowList: readonly Name[],
): string;
export function renderTemplate(
  template: string,
  values: TemplateValues<string>,
  allowList: readonly string[] = TEMPLATE_PLACEHOLDERS,
): string {
  return parseSegments(template)
    .map((segment) => {
      if (segment.kind === 'text') {
        return substitutePlaceholders(segment.value, values, allowList);
      }
      if (isFragmentEmpty(segment.inner, values, allowList)) return '';
      return substitutePlaceholders(segment.inner, values, allowList);
    })
    .join('');
}

/** Имена `{…}`, которых нет в allow-list (по умолчанию — поста), без дублей,
 * в порядке появления — для сообщения формы «{дата} не поддерживается». */
export function findUnknownPlaceholders(
  template: string,
  allowList: readonly string[] = TEMPLATE_PLACEHOLDERS,
): string[] {
  const found: string[] = [];
  for (const match of template.matchAll(ANY_BRACES_RE)) {
    const name = match[1] ?? '';
    if (!isKnownPlaceholder(name, allowList) && !found.includes(name)) {
      found.push(name);
    }
  }
  return found;
}
