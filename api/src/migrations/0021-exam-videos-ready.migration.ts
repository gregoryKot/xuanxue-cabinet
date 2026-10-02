// Видео вопросов, записанные до загрузки частями (ADR-0165), получают
// `status: 'ready'` и отпечаток-заглушку `legacy:<_id>`. Новая схема требует оба
// поля: без них такую запись нельзя было бы пересохранить, а выборки готовых
// видео (статистика, уборщик сирот, раздача) не знали бы, что считать «готово».
// Одним шагом конвейера обновления на каждый документ — отпечатку нужен `_id`
// самого документа.
//
// Идемпотентна: берёт только записи без `status`, второй запуск ничего не найдёт.
// Совместима со старым кодом на время деплоя (expand → contract): старый
// инстанс полей не читает и не знает о них. Обратное тоже: старый инстанс
// успевает записать видео без `status` уже после миграции, и новый код читает
// «нет `status`» как «готово» (exam-video.mapper.ts, EXAM_VIDEO_READY_FILTER),
// а не теряет такое видео.
import type { mongo } from 'mongoose';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')) — без второй копии пакета `mongodb`.
type Db = mongo.Db;

const EXAM_VIDEOS = 'exam_videos';
const LEGACY_FINGERPRINT_PREFIX = 'legacy:';

export const examVideosReady = {
  id: '0021-exam-videos-ready',
  async up(db: Db): Promise<void> {
    await db.collection(EXAM_VIDEOS).updateMany({ status: { $exists: false } }, [
      {
        $set: {
          status: 'ready',
          fingerprint: { $concat: [LEGACY_FINGERPRINT_PREFIX, { $toString: '$_id' }] },
        },
      },
    ]);
  },
};
