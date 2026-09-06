// Разбор и проверка дат `/lessons` — чистая логика, юнит-тест без Mongo
// (CLAUDE.md «Тесты»). Только Luxon: `new Date(строка)` в бизнес-логике
// запрещён eslint (ADR-0003).
import { DateTime } from 'luxon';
import { PLANNING_HORIZON_WEEKS } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';

/** ISO 8601 из тела/query запроса → `DateTime` в UTC. `fieldLabel` — имя поля
 * в сообщении об ошибке (`startsAt`, `from`, `to`), чтобы учитель понимал,
 * какое именно значение поправить. */
export function parseUtcIso(value: string, fieldLabel: string): DateTime {
  const parsed = DateTime.fromISO(value, { zone: 'utc' });
  if (!parsed.isValid) {
    throw new InvalidInputError(
      `Поле «${fieldLabel}»: дата в неверном формате. Нужен ISO 8601, например 2026-09-10T16:00:00Z`,
    );
  }
  return parsed;
}

/** Окно списка `GET /lessons` не шире горизонта планировщика — тот же
 * PLANNING_HORIZON_WEEKS, что и у генерации занятий (shared/src/domain.ts):
 * запрашивать больше нет смысла, дальше расписание ещё не построено. */
export function assertListWindow(from: DateTime, to: DateTime): void {
  if (to <= from) {
    throw new InvalidInputError('Конец периода должен быть позже начала');
  }
  const horizon = from.plus({ weeks: PLANNING_HORIZON_WEEKS });
  if (to > horizon) {
    throw new InvalidInputError(
      `Период не больше ${PLANNING_HORIZON_WEEKS} недель — столько занятий планируется вперёд`,
    );
  }
}
