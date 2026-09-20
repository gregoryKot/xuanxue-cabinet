// Рубрикация свободным текстом — общая для материалов и вопросов экзамена
// (ADR-0058): один способ ввода тегов, одна нормализация на оба домена, не
// вторая копия рядом. У вопроса тег раньше был только подписью и поиском по
// точному совпадению; у материала он становится фильтром списка — цена
// опечатки выше, поэтому нормализация обязательна при каждой записи.
export const TAG_LIMITS = { perRecord: 10, length: 40 } as const;

/**
 * Готовит список тегов к записи: обрезает пробелы по краям, схлопывает
 * внутренние пробелы в один, отбрасывает пустые строки, убирает дубли без
 * учёта регистра (первое написание побеждает) и обрезает список до `max`.
 * Длину отдельного тега не трогает и не режет — слишком длинный тег
 * отклоняет DTO (`@MaxLength`, class-validator), это забота валидации, не
 * нормализации.
 */
export function normalizeTags(
  tags: readonly string[],
  max: number = TAG_LIMITS.perRecord,
): string[] {
  const seenLowerCase = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, ' ');
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seenLowerCase.has(key)) continue;
    seenLowerCase.add(key);
    result.push(tag);
    if (result.length >= max) break;
  }
  return result;
}

/**
 * Строка через запятую → массив тегов, готовых к записи: делит по запятой и
 * прогоняет через `normalizeTags` (та же нормализация, что и при прямой
 * передаче массива — второй копии разбора в проекте нет, ADR-0058). Общая
 * для формы материала и формы вопроса экзамена.
 */
export function parseTagsText(
  text: string,
  max: number = TAG_LIMITS.perRecord,
): string[] {
  return normalizeTags(text.split(','), max);
}

/**
 * Один тег в сводке школы (`GET /api/tags`, ADR-0075) — сколько дат занятий
 * и материалов отмечено им по всей истории школы, без окна планирования
 * (ADR-0078). Дата занятия считается и по своему тегу, и по тегу своего
 * курса (ADR-0072) — один раз, не дважды (см. `api/src/tags/tags.queries.ts`).
 */
export interface TagSummaryDto {
  tag: string;
  lessonCount: number;
  materialCount: number;
}

export interface ListTagsQuery {
  limit?: number;
}
