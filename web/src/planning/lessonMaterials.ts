// Чистая логика секции «Материалы» на странице даты занятия (ADR-0056):
// правка списка привязок и отбор кандидатов из библиотеки. Вынесена из
// компонентов, чтобы проверять без React (CLAUDE.md «Тесты»), — тот же приём,
// что у exams/examQuestions.ts.
import type { MaterialDto } from '@xuanxue/shared';
import { matchesSearch } from '../lib/textSearch';

/** Дата занятия добавляется к привязкам материала, а не заменяет их: тот же
 * материал может висеть и на курсе, и на других датах (ADR-0056). Повтор не
 * образуется — сервер принял бы массив с дублем, а «Убрать» потом снял бы
 * только одну копию. */
export function attachLesson(lessonIds: readonly string[], lessonId: string): string[] {
  if (lessonIds.includes(lessonId)) return [...lessonIds];
  return [...lessonIds, lessonId];
}

/** «Убрать» снимает с материала только эту дату — сам материал остаётся в
 * библиотеке со всеми прочими привязками (ADR-0056: удаление живёт на
 * странице материала). */
export function detachLesson(lessonIds: readonly string[], lessonId: string): string[] {
  return lessonIds.filter((id) => id !== lessonId);
}

/** Кандидаты «Из библиотеки»: без уже привязанных к этой дате, по подстроке
 * названия или тега без регистра. Фильтр локальный — библиотека загружена
 * целиком и с лимитом, отдельный запрос на каждую букву не нужен (тот же
 * приём, что у filterQuestionCandidates). */
export function filterLibraryCandidates(
  materials: MaterialDto[],
  query: string,
  attachedIds: readonly string[],
): MaterialDto[] {
  const attached = new Set(attachedIds);
  return materials.filter(
    (material) =>
      !attached.has(material.id) &&
      matchesSearch([material.title, ...material.tags], query),
  );
}
