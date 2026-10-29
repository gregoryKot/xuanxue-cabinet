// «Перегнать видео» (ADR-0189), серверная половина: браузер штата перегнал старый ролик
// в H.264, загрузил результат обычной загрузкой частями (отдельным видео) и просит
// подменить им файл исходного видео. id исходного видео, на который ссылаются вопросы
// и варианты, не меняется — меняется только объект R2 за ним.
//
// ИСХОДНЫЙ ФАЙЛ НЕ УДАЛЯЕТСЯ НИКОГДА (требование владельца): прежние key, contentType,
// sizeBytes и fingerprint уходят в original* того же документа, вернуть их можно
// руками по RUNBOOK. Ни одна строка ниже не кладёт originalKey в журнал сирот и не
// удаляет объект по нему.
//
// Порядок шагов — единственный, при котором падение процесса в любой точке не оставляет
// ни документа, указывающего на удалённый объект, ни двух документов с одним ключом, ни
// исходника, на который не ссылается никто:
//
//   0. Только чтение и проверки. Отказ ничего не меняет, замена остаётся обычной
//      загрузкой, ею займётся уборщик (ExamVideoSweepService).
//   1. Атомарно забрать документ замены: findOneAndDelete с условием (готов, `avc`,
//      свежий). Объект R2 НЕ удаляется. Падение после шага: новый объект лежит в R2
//      без документа — плата за хранение, цель и её исходник не тронуты. Двух документов
//      с одним ключом нет и не будет: у ключа замены остаётся один будущий владелец.
//   2. Одним обновлением цели: key и поля файла ← замена, прежние значения → original*.
//      Условие — тот же key, что мы читали, и отсутствие originalKey: гонка двух замен
//      одной цели и повторная замена кончаются тем, что обновление ничего не находит.
//      Запись одна, поэтому нет мига, когда исходник хранит «никто» или цель смотрит на
//      объект, которого нет: новый объект существует с шага 1.
//   3. Обновление ничего не нашло (цель заменили, убрали, она не готова) — это
//      определённый ответ базы, и только тогда ключ замены, у которого владельца уже
//      нет, идёт обычным путём удаления сирот (removeNow: журнал, потом R2). Ошибка
//      самой базы (обрыв связи) не годится: неизвестно, применилось ли обновление, а
//      удалённый «на всякий случай» объект мог уже быть ключом цели. Тогда ничего не
//      чистим: ключ остаётся лежать, это плата за хранение.
//
// Уборщик сирот не мешает: он берёт видео старше суток (ORPHAN_AGE_HOURS), а замена
// принимается, только пока ей меньше половины срока. Выбранный уборщиком кандидат к
// шагу 1 был бы старше суток и условия не прошёл; без границы уборщик, выбравший
// замену сиротой, удалил бы объект из-под только что обновлённой цели.
import { H264_VIDEO_CODEC, type ExamVideoDto } from '@xuanxue/shared';
import { ConflictError } from '../common/errors';
import { readPoster, setPosterIfAbsent } from '../video-uploads/video-poster';
import {
  REPLACEMENT_MAX_AGE_HOURS,
  loadReplacementPair,
  type ReplaceDeps,
  type ReplaceInput,
} from './exam-video-replace-checks';
import { EXAM_VIDEO_REPLACE_LOST_MESSAGE } from './exam-video-replace.messages';
import {
  EXAM_VIDEO_READY_FILTER,
  readyContentType,
  toExamVideoDto,
  type RawLeanExamVideo,
} from './exam-video.mapper';
import type { ExamVideoRecord } from './exam-video.schema';

/** Что цель получает от замены (шаг 2). Прежние значения цели — в original*: они
 * записываются тем же обновлением, что и новые, одной записью. */
function swapFields(
  target: RawLeanExamVideo,
  claimed: RawLeanExamVideo,
): Partial<ExamVideoRecord> {
  return {
    key: claimed.key,
    contentType: readyContentType(claimed),
    sizeBytes: claimed.sizeBytes,
    fingerprint: claimed.fingerprint,
    videoCodec: H264_VIDEO_CODEC,
    originalKey: target.key,
    originalContentType: readyContentType(target),
    originalSizeBytes: target.sizeBytes,
    // У видео, записанных до загрузки частями, отпечатка может не быть.
    ...(target.fingerprint ? { originalFingerprint: target.fingerprint } : {}),
  };
}

export async function replaceExamVideo(
  deps: ReplaceDeps,
  input: ReplaceInput,
): Promise<ExamVideoDto> {
  const freshSince = input.now.minus({ hours: REPLACEMENT_MAX_AGE_HOURS }).toJSDate();
  const { target, replacement } = await loadReplacementPair(deps, input, freshSince);

  // Шаг 1. Условия повторяют проверки шага 0: между ними мог пройти другой запрос.
  // Забирать не получилось — замену забрал кто-то ещё, или она вошла в вопрос, или
  // уборщик её убрал: объект ей уже не принадлежит, трогать его нельзя.
  const claimed = await deps.model
    .findOneAndDelete({
      _id: replacement._id,
      status: 'ready',
      videoCodec: H264_VIDEO_CODEC,
      key: replacement.key,
      createdAt: { $gte: freshSince },
    })
    .select('+poster')
    .lean<RawLeanExamVideo | null>();
  if (!claimed) throw new ConflictError(EXAM_VIDEO_REPLACE_LOST_MESSAGE);

  // Шаг 2. Новый key не знает ни один другой документ: замена удалена выше.
  const updated = await deps.model
    .findOneAndUpdate(
      {
        _id: target._id,
        ...EXAM_VIDEO_READY_FILTER,
        key: target.key,
        originalKey: { $exists: false },
      },
      // Кэш file_id Telegram относится к старому файлу: бот отправит новый заново.
      { $set: swapFields(target, claimed), $unset: { telegramFileId: 1 } },
      { returnDocument: 'after' },
    )
    .lean<RawLeanExamVideo | null>();

  // Шаг 3. Удаляем только ключ замены, у которого владельца нет. originalKey и
  // прежний key цели не трогаются ни при каком исходе.
  if (!updated) {
    await deps.orphans.removeNow(claimed.key, input.now);
    throw new ConflictError(EXAM_VIDEO_REPLACE_LOST_MESSAGE);
  }
  // Кадр цели не перетирается; нет своего — берётся кадр замены. Он не нужен для
  // целостности, поэтому ставится отдельной записью после обновления.
  await setPosterIfAbsent(
    deps.model,
    target._id.toString(),
    readPoster(claimed) ?? undefined,
  );
  return toExamVideoDto(updated);
}
