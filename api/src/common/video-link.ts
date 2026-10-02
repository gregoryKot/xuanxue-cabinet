// Скачивание видео-файла вместо просмотра (ADR-0165, «Плеер»): `?download=1`
// у `GET /exam-videos/:id` и `GET /answer-videos/:id` ведёт на ту же подписанную
// ссылку R2, но с `Content-Disposition: attachment`. Менеджер загрузок
// браузера на слабой связи докачивает файл сам, а HEVC, который не открыл
// браузер, откроет системный плеер. Общее для обоих контроллеров: расширение
// по типу, срок жизни ссылки и подпись — одно место, не по копии в каждом
// сервисе (ExamVideosService, AnswerVideosService).
import type { DateTime } from 'luxon';
import { EXAM_VIDEO_CONTENT_TYPES, type ExamVideoContentType } from '@xuanxue/shared';
import type { FileStoreService, SignedDownload } from '../storage/file-store.service';

/** Что просят у сервиса подписи: ссылку для просмотра или для сохранения. */
export interface VideoUrlOptions {
  download: boolean;
}

export const VIEW_VIDEO: VideoUrlOptions = { download: false };

const VIDEO_DOWNLOAD_BASE_NAME = 'video';
// Самый частый случай: телефон снимает MP4 (H.264 или HEVC в контейнере mp4).
const FALLBACK_VIDEO_CONTENT_TYPE: ExamVideoContentType = 'video/mp4';

// Расширение — по типу, который сервер определил по сигнатуре байтов
// (sniffVideoSignature), а не по имени файла: имени у нас нет, и хранить его
// мы не собираемся. Системный плеер выбирает программу как раз по расширению.
const VIDEO_EXTENSIONS: Record<ExamVideoContentType, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

function isVideoContentType(value: string): value is ExamVideoContentType {
  return (EXAM_VIDEO_CONTENT_TYPES as readonly string[]).includes(value);
}

/** Параметры скачивания для `FileStoreService.signedGetUrl`, либо `undefined`
 * для просмотра. `contentType` может не быть: у видео-ответа он ставится на
 * первой части (answer-video.schema.ts), и у старого или недогруженного
 * документа его нет — тогда `mp4`. */
export function videoDownload(
  { download }: VideoUrlOptions,
  contentType?: string,
): SignedDownload | undefined {
  if (!download) return undefined;
  const type =
    contentType !== undefined && isVideoContentType(contentType)
      ? contentType
      : FALLBACK_VIDEO_CONTENT_TYPE;
  return {
    name: `${VIDEO_DOWNLOAD_BASE_NAME}.${VIDEO_EXTENSIONS[type]}`,
    contentType: type,
  };
}

// Ссылка живёт час — дольше, чем у файла материала (десять минут, ADR-0057):
// файл скачивают один раз, а ролик плеер докачивает range-запросами по тому
// же подписанному адресу всё время, пока его смотрят и перематывают.
const VIDEO_URL_TTL_SECONDS = 3600;

interface SignedVideoUrlInput {
  fileStore: Pick<FileStoreService, 'signedGetUrl'>;
  /** Запись о видео после проверки права: ключ объекта и тип файла. */
  doc: { key: string; contentType?: string };
  now: DateTime;
  options: VideoUrlOptions;
}

/** Подписанная ссылка на видео для просмотра или скачивания. Право доступа
 * вызывающий сервис проверил до неё: сюда попадает только разрешённая запись. */
export function signedVideoUrl({
  fileStore,
  doc,
  now,
  options,
}: SignedVideoUrlInput): string {
  const download = videoDownload(options, doc.contentType);
  return fileStore.signedGetUrl(doc.key, VIDEO_URL_TTL_SECONDS, now, download);
}
