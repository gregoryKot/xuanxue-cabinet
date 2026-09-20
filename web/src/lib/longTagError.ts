// Проверка «тег длиннее лимита» — общая для всех форм с тегами (материал,
// занятие расписания, скоро дата занятия). Сервер такой тег отклонит
// (`@MaxLength`, ADR-0058/ADR-0072) — форма ловит его раньше, чтобы не
// гонять человека по кругу «сохранить → 400». Текст ошибки раньше был
// вписан в каждую форму отдельно и разошёлся бы при первой правке (CLAUDE.md
// «Одна механика — один компонент»), поэтому он один здесь.
import { parseTagsText, TAG_LIMITS } from '@xuanxue/shared';

/** `null` — все теги не длиннее `TAG_LIMITS.length`; иначе текст ошибки с
 * первым найденным длинным тегом. */
export function longTagError(tagsText: string): string | null {
  const longTag = parseTagsText(tagsText).find((tag) => tag.length > TAG_LIMITS.length);
  if (!longTag) return null;
  return `Тег «${longTag}» длиннее ${TAG_LIMITS.length} символов. Сократите его.`;
}
