// Проверка окна `from..to` — общая для любого списка с обязательным периодом
// (CLAUDE.md «API»: «дай всё» запрещено). Домены отличаются только пределом
// в неделях и хвостом сообщения — почему именно столько (lesson-dates.ts:
// горизонт планировщика; broadcast-journal.ts: журнал по частям).
import type { DateTime } from 'luxon';
import { InvalidInputError } from './errors';

export function assertWindow(
  from: DateTime,
  to: DateTime,
  weeks: number,
  reasonSuffix: string,
): void {
  if (to <= from) {
    throw new InvalidInputError(
      'Конец периода должен быть позже начала. Поправьте даты.',
    );
  }
  const horizon = from.plus({ weeks });
  if (to > horizon) {
    throw new InvalidInputError(`Период не больше ${weeks} недель — ${reasonSuffix}`);
  }
}
