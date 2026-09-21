// Защита материала от ученика, которому он не предназначен (ADR-0058) —
// чистая функция без Mongo и без DI (CLAUDE.md «Логика вне контроллеров»),
// юнит-тест — material-access.spec.ts. Единственное правило видимости,
// оставшееся после ADR-0096 (отменяет ADR-0048, доступ по оплате): служебный
// материал (`access: 'staff'`) ученику не показываем.
import type { MaterialAccess } from '@xuanxue/shared';

export interface MaterialAccessInput {
  access: MaterialAccess;
  /** Штат школы (`isStaffRole(user.roles)`) видит любой материал —
   * MyMaterialsController открыт любой роли, разница только в этом флаге. */
  isStaff: boolean;
}

/**
 * Материал скрыт от ученика, когда у него стоит «только преподаватели», а
 * смотрит не штат школы.
 *
 * Вызывать эту функцию на каждый материал ученику вообще не должен
 * приходиться: `staff`-материал отсекает запрос Mongo в
 * `MaterialsService.listForStudent`/`LessonMaterialsService.findByLessonIds`
 * ещё до выборки, чтобы служебные материалы не съедали лимит списка. Вызов
 * здесь — та же проверка ещё раз, после расшифровки, страховка на случай
 * потерянного фильтра (правка сервиса, вызов из нового места и т. п.,
 * ADR-0096 «Решение»): штат не скрыт никогда, а не-штат для `staff` получает
 * `true` (скрыто), не `false` — молчаливая утечка служебного материала хуже
 * ложного замка, который вообще не должен был показаться.
 */
export function isMaterialHiddenFromStudent({
  access,
  isStaff,
}: MaterialAccessInput): boolean {
  if (isStaff) return false;
  return access === 'staff';
}

/**
 * Те из материалов, что ученику действительно едут. `staff` уже вырезан
 * запросом Mongo (MaterialsService.listForStudent,
 * LessonMaterialsService.findByLessonIds) — здесь тот же отбор ещё раз,
 * страховка на случай потерянного фильтра (ADR-0096 «Решение»).
 *
 * Одна функция на библиотеку и на архив, а не два одинаковых `filter` в
 * двух сервисах (CLAUDE.md «Одна механика — один компонент»). И ветка
 * «материал скрыт» здесь проверяется тестом: в самих сервисах она
 * недостижима — запрос Mongo отсекает `staff` раньше, — а недостижимая
 * ветка страховки просаживает покрытие и никем не сторожится.
 */
export function visibleForStudent<T extends { access: MaterialAccess }>(
  docs: T[],
  isStaff: boolean,
): T[] {
  return docs.filter(
    (doc) => !isMaterialHiddenFromStudent({ access: doc.access, isStaff }),
  );
}
