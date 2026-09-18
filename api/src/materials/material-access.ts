// Правило доступа к материалу по оплате (ADR-0048, docs/PLAN.md §14 слой
// 3.4) — чистая функция без Mongo и без DI (CLAUDE.md «Логика вне
// контроллеров»), юнит-тест — material-access.spec.ts. Вызывается из
// MaterialsService.listForStudent на каждый материал библиотеки ученика.
import type { MaterialAccess } from '@xuanxue/shared';

export interface MaterialAccessInput {
  access: MaterialAccess;
  /** `settings.materialsPaidAccess` — рубильник школы, не отметка материала. */
  paidAccessEnabled: boolean;
  /** Штат школы (`isStaffRole(user.roles)`) видит закрытые материалы как
   * обычные — MyMaterialsController открыт любой роли (ADR-0048). */
  isStaff: boolean;
}

/**
 * Материал закрыт, когда рубильник школы включён, у материала стоит
 * «после оплаты» и смотрит не штат школы.
 *
 * ВАЖНО (ADR-0048): коллекции `payments` в кабинете ещё нет (она приезжает
 * этапом 2, docs/PLAN.md §15) — «оплативших» как множества не существует.
 * Поэтому включённый рубильник закрывает `paid`-материалы ВСЕМ ученикам, а
 * не только тем, кто не платил, — это осознанное решение ADR-0048, а не
 * недосмотр. Когда появится `payments`, здесь заменится последняя строка на
 * проверку статуса месяца конкретного ученика — контракт (`MyMaterialDto`) и
 * экраны не меняются, меняется только эта функция.
 */
export function isMaterialLocked({
  access,
  paidAccessEnabled,
  isStaff,
}: MaterialAccessInput): boolean {
  if (isStaff) return false;
  if (access !== 'paid') return false;
  return paidAccessEnabled;
}
