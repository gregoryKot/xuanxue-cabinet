// Переключение тега в строке через запятую и список уже выбранных —
// логика поля тегов (TagsField.tsx) отдельно от React и DOM (CLAUDE.md
// «Логика вне компонентов»): тест проверяет её саму, без рендера. Разбор
// строки — только parseTagsText (@xuanxue/shared, ADR-0058), своей копии
// сравнения регистра здесь не заводим.
import { parseTagsText } from '@xuanxue/shared';

/**
 * Нажатие на готовый тег: добавляет его в строку, если там нет (без учёта
 * регистра — тем же приёмом, что normalizeTags схлопывает дубли при записи),
 * и убирает, если уже есть. Пустая строка — тот же путь, что и любая
 * другая: parseTagsText отдаёт [], тег добавляется первым.
 */
export function toggleTagInText(text: string, tag: string): string {
  const tags = parseTagsText(text);
  const key = tag.toLowerCase();
  const withoutTag = tags.filter((existing) => existing.toLowerCase() !== key);
  const next = withoutTag.length === tags.length ? [...tags, tag] : withoutTag;
  return next.join(', ');
}

/**
 * Какие из `options` уже стоят в строке — для `aria-pressed` пилюль поля.
 * Сравнение без учёта регистра, тем же приёмом, что и toggleTagInText выше.
 */
export function selectedTagOptions(text: string, options: readonly string[]): string[] {
  const selectedLowerCase = new Set(
    parseTagsText(text).map((tag) => tag.toLowerCase()),
  );
  return options.filter((option) => selectedLowerCase.has(option.toLowerCase()));
}
