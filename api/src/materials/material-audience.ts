// Кому уйдёт «Новый материал» (ADR-0162, «Теги — внутри»): чистая логика без
// Mongo, юнит-тест на все ветки (CLAUDE.md «Тесты»). Ученик выбирает занятия,
// которые видит в расписании, а не слова-теги, поэтому материал сводится к
// набору занятий расписания, а дальше решает тот же `isLessonInScope`, что у
// «Занятия скоро», отмены и записи.
//
// Набор занятий материала — объединение трёх источников: прямая привязка
// (`classIds`), занятия, к которым относятся привязанные даты (`lessonIds`,
// ADR-0056), и АКТИВНЫЕ занятия расписания с общим тегом (ADR-0072) — тем же
// сравнением, что у канала (`channelAcceptsLessonTags`, ADR-0108). Пустой набор —
// «общий» материал: он не про занятие, и выбор «о каких занятиях» его не
// фильтрует.
import { isLessonInScope, type LessonScope } from '@xuanxue/shared';
import { channelAcceptsLessonTags } from '../channels/channel-tag-match';

/** Занятие расписания глазами сверки по тегам. */
export interface AudienceClass {
  id: string;
  tags: readonly string[];
}

export interface MaterialAudienceInput {
  /** `materials.classIds` — прямая привязка. */
  classIds: readonly string[];
  /** Занятия расписания, к которым относятся даты из `materials.lessonIds`. */
  lessonClassIds: readonly string[];
  /** `materials.tags`. */
  tags: readonly string[];
  /** Активные занятия расписания с их тегами; неактивные сюда не попадают. */
  activeClasses: readonly AudienceClass[];
}

/** Занятия расписания, о которых этот материал. Прямая привязка и привязка через
 * дату работают и для выключенного занятия (учитель привязал его сам, и материал
 * не становится «общим» оттого, что занятие потом выключили), а теги ищут только
 * среди активных: тег совпал с занятием, которого в расписании уже нет, — не
 * повод считать его адресатом. Тег материала, не совпавший ни с одним занятием,
 * набор не расширяет и не сужает: «книга», «статья» — рубрика, а не маршрут. */
export function materialAudienceClassIds(input: MaterialAudienceInput): Set<string> {
  const audience = new Set([...input.classIds, ...input.lessonClassIds]);
  // Пустой список тегов у `channelAcceptsLessonTags` значит «принимает всё» — у
  // материала это «тегов нет», и по тегам он никого не выбирает.
  if (input.tags.length === 0) return audience;
  for (const cls of input.activeClasses) {
    if (channelAcceptsLessonTags(input.tags, cls.tags)) audience.add(cls.id);
  }
  return audience;
}

/** Касается ли материал выбора человека. Общий материал (пустой набор) приходит
 * всем, у кого вид включён, даже при режиме «Только о выбранных» без галочек:
 * выбор фильтрует занятия, а у такого материала занятия нет. Материал с занятиями
 * приходит, если выбор касается хотя бы одного из них (`all` касается любого). */
export function isMaterialInScope(
  scope: LessonScope,
  audience: ReadonlySet<string>,
): boolean {
  if (audience.size === 0) return true;
  return [...audience].some((classId) => isLessonInScope(scope, classId));
}
