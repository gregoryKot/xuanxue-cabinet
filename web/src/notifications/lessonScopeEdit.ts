// Правка выбора «о каких занятиях» (ADR-0162) — чистая логика без React и сети:
// из текущего выбора и клика получается тело PUT. Экран шлёт выбор ЦЕЛИКОМ
// (`{ mode, classIds }`), поэтому всё, что попадёт в тело, решается здесь.
import type { LessonScope, LessonScopeClassDto, LessonScopeMode } from '@xuanxue/shared';

/** Отмеченные занятия, которые человек видит в списке, — в порядке списка, а
 * не в порядке кликов. Устаревший id в выборе (занятие удалили после того, как
 * его отметили) сюда не попадает нарочно: сервер отвечает 400 на любой id,
 * которого нет в расписании, и один такой id в теле не дал бы человеку
 * сохранить вообще ничего — ни режим, ни новую галочку. Выключенное занятие в
 * списке не показывается и тоже отпадает: оно ни на что не влияет, пока его не
 * включили (ADR-0162), а вернувшись, попросит галочку заново. */
export function tickedClassIds(
  scope: LessonScope,
  classes: readonly LessonScopeClassDto[],
): string[] {
  return classes
    .filter((item) => scope.classIds.includes(item.id))
    .map((item) => item.id);
}

/** Режим «все» галочки не стирает: вернулся к «выбранным» — они на месте. */
export function scopeWithMode(
  scope: LessonScope,
  classes: readonly LessonScopeClassDto[],
  mode: LessonScopeMode,
): LessonScope {
  return { mode, classIds: tickedClassIds(scope, classes) };
}

export function scopeWithTick(
  scope: LessonScope,
  classes: readonly LessonScopeClassDto[],
  classId: string,
  isTicked: boolean,
): LessonScope {
  const ticked = new Set(tickedClassIds(scope, classes));
  if (isTicked) ticked.add(classId);
  else ticked.delete(classId);
  // Порядок списка, а не кликов: тело PUT не зависит от того, что отметили первым.
  return {
    mode: scope.mode,
    classIds: classes.filter((item) => ticked.has(item.id)).map((item) => item.id),
  };
}

/** «Выбранные» без единой видимой галочки — честное «ни о каких» (ADR-0162). */
export function hasNoTicks(
  scope: LessonScope,
  classes: readonly LessonScopeClassDto[],
): boolean {
  return scope.mode === 'selected' && tickedClassIds(scope, classes).length === 0;
}
