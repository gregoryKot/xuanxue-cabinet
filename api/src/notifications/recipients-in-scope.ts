// Кого из получателей касается занятие по их собственному выбору «о каких
// занятиях» (ADR-0162). Чистая функция: тик напоминания читает выбор пачки
// одним запросом (LessonScopeService.getMany), а здесь только отбирает.
import { isLessonInScope, type LessonScope } from '@xuanxue/shared';

/** Человек, которого нет в `scopes`, выбора не делал, — значит, `all`: ему
 * занятие положено, как и до ADR-0162. */
export function recipientsInScope<T extends { id: string }>(
  recipients: readonly T[],
  scopes: ReadonlyMap<string, LessonScope>,
  classId: string,
): T[] {
  return recipients.filter((recipient) => {
    const scope = scopes.get(recipient.id);
    return !scope || isLessonInScope(scope, classId);
  });
}
