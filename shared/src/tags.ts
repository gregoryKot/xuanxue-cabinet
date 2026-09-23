// Рубрикация свободным текстом — общая нормализация тегов для доменов школы,
// у которых теги остались (материалы, занятия, каналы; ADR-0058). У вопроса
// экзамена теги были тем же способом ввода, но владелец решил убрать их из
// вопроса совсем — уточнено ADR-0128.
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
  /** Каналы (ADR-0108) тоже считаются — иначе тег, набранный первым у
   * канала, не предложился бы в расписании, и написание разъехалось бы ровно
   * там, где его цена выше всего: тег канала решает, куда уйдёт пост
   * (ADR-0116). Экран тега это число не показывает — он про занятия и
   * материалы (ADR-0075) и тег без них в списке не рисует. Вопрос экзамена
   * тегов больше не несёт (ADR-0128) — счёт по нему убран, не обнулён. */
  channelCount: number;
}

export interface ListTagsQuery {
  limit?: number;
}
