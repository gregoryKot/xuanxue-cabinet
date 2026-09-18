// Число материалов, которые доступ по оплате закроет прямо сейчас
// (docs/PLAN.md §14 слой 3.4, ADR-0048) — не §3.5 (тот будущий
// /materials/summary), лёгкая подсказка рядом с самим рубильником: учитель
// видит, что именно нажимает, до того как нажал. Чистая функция, юнит-тест
// без DOM (CLAUDE.md «Тесты»).
import { pluralRu } from '@xuanxue/shared';

const MATERIAL_FORMS = {
  one: 'материал',
  few: 'материала',
  many: 'материалов',
  other: 'материала',
};

/** `null` — список ещё не загружен, отфильтрован по виду (число тогда не
 * отражало бы всю библиотеку) или сбой загрузки: честнее промолчать, чем
 * дать число, которое ничего не значит (CLAUDE.md «Продуктовая фича —
 * число...»). */
export function formatPaidMaterialsCountHint(paidCount: number | null): string | null {
  if (paidCount === null) return null;
  if (paidCount === 0) return 'Сейчас так не помечен ни один материал.';
  return `Сейчас так помечено ${paidCount} ${pluralRu(paidCount, MATERIAL_FORMS)}.`;
}
