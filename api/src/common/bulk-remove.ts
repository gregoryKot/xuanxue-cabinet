// Общий оркестратор массового удаления (ADR-0141, CLAUDE.md «Одна механика —
// один компонент»): контроллер передаёт свой же `remove(id)` — тот же метод,
// что вызывает одиночный `DELETE /:id`, — так что все правила одиночного
// удаления (мягкое, в любом статусе — ADR-0140; валидный ObjectId; «не
// найден» на уже удалённом) действуют без дублирования. Чистая функция без Nest, тестируется без Mongo и без HTTP
// (CLAUDE.md «Логика вне контроллеров»).
import type { BulkDeleteFailure, BulkDeleteResult } from '@xuanxue/shared';
import { DomainError } from './errors';

/**
 * Удаляет `ids` по одному, последовательно, не `Promise.all`: 200 коротких
 * `updateOne` подряд (`BULK_DELETE_MAX_IDS`, shared/src/bulk-delete.ts) —
 * доли секунды, а двести одновременных запросов к Atlas M0 от одного клика
 * ни к чему; заодно порядок `deletedIds`/`failed` — порядок входных `ids`.
 * Дубли обрабатываются один раз.
 *
 * `DomainError` одного id уходит в `failed` со своим текстом (VOICE.md — тот
 * же текст, что вернуло бы одиночное удаление), остальные id продолжаются.
 * Любая другая ошибка бросается наверх немедленно (500 через глобальный
 * фильтр) — уже удалённые к этому моменту id остаются удалёнными, повторный
 * запрос с тем же списком доудалит остальное.
 */
export async function bulkRemove(
  ids: readonly string[],
  removeOne: (id: string) => Promise<void>,
): Promise<BulkDeleteResult> {
  const uniqueIds = [...new Set(ids)];
  const deletedIds: string[] = [];
  const failed: BulkDeleteFailure[] = [];
  for (const id of uniqueIds) {
    try {
      await removeOne(id);
      deletedIds.push(id);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      failed.push({ id, message: error.message });
    }
  }
  return { deletedIds, failed };
}
