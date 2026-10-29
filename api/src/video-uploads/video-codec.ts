// Кодек видео-файла (ADR-0188, ADR-0189): «H.264 ли это» решает браузер при загрузке
// (`complete` несёт `codec`) или браузер штата, когда читает старое видео из байтов
// (`PUT /exam-videos/:id/codec`). Здесь — выборка «не H.264», общая для списка кнопки
// «Перегнать видео» и числа в сводке раздела.
import type { Model } from 'mongoose';
import { H264_VIDEO_CODEC } from '@xuanxue/shared';
import type { VideoUploadRecord } from './video-upload.schema';

/** «Не H.264»: поля нет (кодек не известен — загружено до ADR-0189) или в нём не
 * `avc`. `$ne` в Mongo берёт и документы без поля — отдельного условия на «нет
 * поля» не нужно, а миграция, дописывающая кодек старым видео, невозможна: сервер
 * не умеет читать кодек из байтов (ADR-0165). То же условие, в виде выражения
 * агрегации, считает число в сводке (exam-video-stats.service.ts): список и число
 * не расходятся, это держит aggregation-тест на одних и тех же данных. */
const NOT_H264_FILTER = { videoCodec: { $ne: H264_VIDEO_CODEC } };

/** Готовые видео не в H.264, старые первыми (ADR-0189): браузер штата берёт пачку,
 * перегоняет и спрашивает следующую, пока список не опустеет.
 *
 * Индекса под выборку нет сознательно: условие `$ne` по малоселективному полю
 * индексом не ускоряется, а видео вопросов в школе — сотни, не миллионы; список и
 * сводка читают их за миллисекунды существующим `{ createdAt, _id }`. Появится
 * тысячи записей — заводится частичный индекс (`partialFilterExpression` по
 * `videoCodec`), вместе с решением в ADR. `ready` — фильтр готовности своего вида
 * видео (у каждого он свой документ). */
export function findVideosCodecPending<T extends VideoUploadRecord, Doc>(
  model: Model<T>,
  ready: Record<string, unknown>,
  limit: number,
): Promise<Doc[]> {
  return model
    .find({ ...ready, ...NOT_H264_FILTER })
    .sort({ createdAt: 1, _id: 1 })
    .limit(limit)
    .lean<Doc[]>();
}
