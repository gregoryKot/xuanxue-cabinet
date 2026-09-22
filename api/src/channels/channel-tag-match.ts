// Правило «какие каналы принимают рассылку по тегам» (ADR-0106): канал без
// тегов принимает всё — прежнее поведение, ничего не выбирали по тегу. Канал
// с тегами принимает только даты занятий, у которых есть общий тег — свой
// тег даты занятия (LessonRecord.tags, ADR-0075) или тег занятия в
// расписании, к которому дата относится (ClassRecord.tags, ADR-0072).
// Сравнение без учёта регистра — тем же способом, что normalizeTags
// схлопывает дубли (shared/src/tags.ts): здесь, в отличие от точного
// совпадения у фильтра `GET /lessons?tag=`, цена ошибки — молча не
// уехавший пост, а не пустой список, поэтому точное совпадение не годится.
export function channelAcceptsLessonTags(
  channelTags: readonly string[],
  lessonTags: readonly string[],
): boolean {
  if (channelTags.length === 0) return true;
  const lessonTagsLower = new Set(lessonTags.map((tag) => tag.toLowerCase()));
  return channelTags.some((tag) => lessonTagsLower.has(tag.toLowerCase()));
}
