// Строка автопроверки варианта (ТЗ 4.6, п.3) — сколько верных выбрал ученик
// из скольких верных всего, и сколько лишних (неверных) выбрал вместе с
// ними. pluralRu — общий примитив склонения (shared/src/plural-ru.ts).
import { pluralRu, type AttemptOptionCheckDto } from '@xuanxue/shared';

const EXTRA_FORMS = { one: 'лишний', few: 'лишних', many: 'лишних', other: 'лишних' };

export function formatOptionsCheckSummary(check: AttemptOptionCheckDto): string {
  const base = `Выбрано верно ${check.correctSelectedCount} из ${check.correctTotalCount}`;
  if (check.incorrectSelectedCount === 0) return `${base}.`;
  return (
    `${base}, ещё ${check.incorrectSelectedCount} ` +
    `${pluralRu(check.incorrectSelectedCount, EXTRA_FORMS)}.`
  );
}
