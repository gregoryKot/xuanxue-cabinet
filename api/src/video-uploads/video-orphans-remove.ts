// Хвост уборки видео-сирот (ExamVideoSweepService, дальше — другие виды видео школы):
// кандидатов выбрал и «кто на них ссылается» посчитал домен, здесь — убрать тех,
// на кого не ссылается никто. Одна механика на оба вида (CLAUDE.md «Одна механика —
// один компонент»).
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import type { StorageOrphansService } from '../storage/storage-orphans.service';
import type { VideoUploadRecord } from './video-upload.schema';

export interface OrphanCandidate {
  _id: Types.ObjectId;
  key: string;
}

/** Удаляет кандидатов, чьих id нет в `referenced`; возвращает, сколько убрано.
 * `removeNow` (ADR-0079) сама кладёт ключ в журнал перед удалением из R2 — отказ
 * хранилища не теряет ключ молча, следующий тик StorageOrphansService.sweep доберёт
 * его сам, даже если запись видео удалена уже сейчас. */
export async function removeUnreferencedVideos<T extends VideoUploadRecord>(
  deps: { model: Model<T>; orphans: StorageOrphansService },
  candidates: readonly OrphanCandidate[],
  referenced: ReadonlySet<string>,
  now: DateTime,
): Promise<number> {
  const orphans = candidates.filter((doc) => !referenced.has(doc._id.toString()));
  if (orphans.length === 0) return 0;
  for (const orphan of orphans) {
    await deps.orphans.removeNow(orphan.key, now);
  }
  await deps.model.deleteMany({ _id: { $in: orphans.map((doc) => doc._id) } });
  return orphans.length;
}
