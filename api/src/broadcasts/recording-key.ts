// Ключ идемпотентности рассылки записи и решение «есть ли что рассылать» — чистая
// логика рядом с RecordingBroadcastService (юнит-тест без Mongo, CLAUDE.md «Тесты»).
import type { Recording } from '@xuanxue/shared';

/** Ключ: файл в кабинете (`videoId`) первым — одна запись, один пост, даже со
 * ссылкой рядом (ADR-0180); дальше url, затем file_id. Ключи разных видов не
 * пересекаются (hex ObjectId не https-адрес), у старых записей videoId нет.
 * `assertHasRecordingSource` (lessons.recording.ts) гарантирует, что хотя бы одно
 * поле есть. */
export function recordingKeyOf(recording: Recording): string | undefined {
  return recording.videoId ?? recording.url ?? recording.telegramFileId;
}

/** Есть ли у записи что положить в пост: ссылка или файл у бота. Запись только с
 * `videoId` пока рассылать нечем: пост вышел бы с пустой `{ссылка}` и без видео.
 * Её рассылку запустят публикации (ADR-0180, PLAN §18 слой 2), когда файл дойдёт до
 * площадок. Если ссылка есть вместе с `videoId`, рассылаем как раньше, ключ — videoId. */
export function hasBroadcastableSource(recording: Recording): boolean {
  return recording.url !== undefined || recording.telegramFileId !== undefined;
}
