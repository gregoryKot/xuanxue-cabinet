// Массовое удаление из списка кабинета (ADR-0141): один POST на коллекцию и
// частичный успех. Каждая запись проходит тот же `remove()`, что и одиночное
// `DELETE /<коллекция>/:id` (ADR-0140), и отказ по одной — например, её уже
// удалили с другого устройства — не отменяет остальные: сервер удалит, что
// может, а про остальное скажет, почему нет.
import { LIST_LIMIT_MAX } from './classes';

/** Потолок одного запроса — столько же, сколько список отдаёт за раз
 * (LIST_LIMIT_MAX): выбрать больше, чем есть на экране, всё равно нельзя. */
export const BULK_DELETE_MAX_IDS = LIST_LIMIT_MAX;

/** Тело `POST /<коллекция>/bulk-delete`. */
export interface BulkDeleteInput {
  ids: string[];
}

/** Запись, которую не удалили, и почему — текст той же доменной ошибки, что
 * вернуло бы одиночное удаление (VOICE.md: что случилось и что сделать). */
export interface BulkDeleteFailure {
  id: string;
  message: string;
}

export interface BulkDeleteResult {
  deletedIds: string[];
  failed: BulkDeleteFailure[];
}
