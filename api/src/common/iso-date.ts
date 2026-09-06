// Luxon типизирует `DateTime.toISO()` как `string | null` (null у невалидного
// DateTime). Маппер получает Date всегда из Mongoose (`timestamps: true`) —
// null здесь означает баг в другом месте вызова, а не пользовательский
// случай, поэтому падаем явно вместо `!`/тихого 'Invalid DateTime' в ответе
// API. Не в api/src/utils — там жёсткий пол покрытия (coverage-baseline.json).
import { DateTime } from 'luxon';

export function toIsoUtc(date: Date): string {
  const iso = DateTime.fromJSDate(date).toUTC().toISO();
  if (iso === null) {
    throw new Error(`toIsoUtc: невалидная дата ${String(date)}`);
  }
  return iso;
}
