// Мягкое удаление (ADR-0140): экзамен и вопрос банка удаляются в любом
// статусе, без отказа — учитель попросил «надо всё удалять» (решение
// 2026-09-27). Документ остаётся в Mongo с отметкой `deletedAt`, а не
// стирается: у попытки/оценки/медиа не рвётся ссылка, если школа
// восстановит данные руками через RUNBOOK.
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { NotFoundError } from './errors';

// У старых документов поля `deletedAt` нет вовсе — `null` в фильтре Mongo
// совпадает и с отсутствующим полем, и с явным `null`, поэтому миграция
// экзаменам/вопросам, заведённым до ADR-0140, не нужна.
export const NOT_DELETED = { deletedAt: null } as const;

/** Фильтр по `_id` и «ещё не удалён» разом — второй вызов на уже удалённый
 * id не находит документа и не трогает `deletedAt` повторно (idempotent по
 * построению, без отдельной проверки статуса заранее — гонки не остаётся,
 * как у claim-once.ts). */
export async function softDelete<T>(
  model: Model<T>,
  id: string,
  now: DateTime,
  notFoundMessage: string,
): Promise<void> {
  const { matchedCount } = await model.updateOne(
    { _id: id, ...NOT_DELETED },
    { $set: { deletedAt: now.toJSDate() } },
  );
  if (matchedCount === 0) throw new NotFoundError(notFoundMessage);
}
