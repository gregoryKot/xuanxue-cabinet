// Один прогон «Перегнать видео» (ADR-0189): список видео, про которые не известно,
// что они в H.264 → по одному: прочитать кодек → H.264 пометить, остальное скачать,
// перегнать, проверить, загрузить и подменить файл. Не React и не знает маршрутов
// (их подставляет хук) — тестируется без DOM, по образцу examVideoPosterBackfillRunner.ts.
//
// Главное правило прогона: оригинал не теряется ни при каком раскладе. Подмена
// (`replace`) вызывается, только когда перегон сохранил все дорожки, копия
// открывается как H.264 той же длины (это проверяет `convert`), загрузка дошла до
// `complete` и сервер хранит ровно столько байт, сколько в копии. Любая осечка —
// видео «не вышло», `replace` не зовётся, а кодек H.264 не записывается: оно
// остаётся в списке и ждёт прогона с Mac или iPhone. Ошибка одного видео не
// останавливает остальные; останавливает только отказ в доступе.
import { H264_VIDEO_CODEC, type VideoCodec } from '@xuanxue/shared';
import type { VideoProbe } from '../video-upload/probeVideoCodec';
import { isNoAccess, nextPendingBatch } from './examVideoBackfillBatch';

const NO_ACCESS_MESSAGE =
  'Нет доступа. Войдите заново под учётной записью **учителя или админа** и нажмите «Перегнать видео» ещё раз.';
const LIST_FAILED_MESSAGE =
  'Список видео не загрузился. Проверьте связь и нажмите «Перегнать видео» ещё раз: **перегнанные видео сохранены**.';
const FAILURE_MESSAGES = { noAccess: NO_ACCESS_MESSAGE, listFailed: LIST_FAILED_MESSAGE };

export interface CodecBackfillProgress {
  /** Перегнано в H.264 и подменено. */
  converted: number;
  /** Уже были в H.264: кодек записан, файл не тронут. */
  alreadyH264: number;
  /** Остались как были: этот браузер не перегнал, копия не прошла проверку или
   * что-то сломалось по дороге. Оригиналы целы. */
  failed: number;
  /** Сколько видео ждали в начале; `null`, пока неизвестно. */
  total: number | null;
}

export interface CodecBackfillRunResult extends CodecBackfillProgress {
  /** Текст для человека, если прогон оборвался; `null` — дошёл до конца. */
  error: string | null;
  /** Отменён сигналом — состояние экрана уже не нужно. */
  cancelled: boolean;
}

export interface RunCodecBackfillParams {
  signal: AbortSignal;
  /** Число из сводки раздела; без него итог — длина первой пачки. */
  total: number | null;
  /** Следующая пачка видео (`GET /exam-videos/codec-pending`). */
  listPending: (signal: AbortSignal) => Promise<{ id: string }[]>;
  /** Кодек и «перегоняется ли здесь» по началу файла (probeVideoCodec, не бросает). */
  probe: (videoId: string, signal: AbortSignal) => Promise<VideoProbe>;
  /** Запись кодека (`PUT /exam-videos/:id/codec`). */
  markCodec: (videoId: string, codec: VideoCodec, signal: AbortSignal) => Promise<void>;
  /** Скачивает видео и отдаёт проверенную копию в H.264 или `null`. */
  convert: (videoId: string, signal: AbortSignal) => Promise<Blob | null>;
  /** Загружает копию новым видео; отвечает после `complete`. */
  upload: (copy: Blob, signal: AbortSignal) => Promise<{ id: string; sizeBytes: number }>;
  /** Подмена файла (`POST /exam-videos/:id/replace`). */
  replace: (videoId: string, replacementId: string, signal: AbortSignal) => Promise<void>;
  onProgress: (progress: CodecBackfillProgress) => void;
}

type VideoOutcome = 'converted' | 'alreadyH264' | 'failed';

async function handleVideo(
  id: string,
  params: RunCodecBackfillParams,
): Promise<VideoOutcome> {
  const { signal, probe, markCodec, convert, upload, replace } = params;
  const { codec, canConvert } = await probe(id, signal);
  if (codec === H264_VIDEO_CODEC) {
    await markCodec(id, codec, signal);
    return 'alreadyH264';
  }
  // Браузер без декодера этого кодека не качает файл впустую.
  const copy = canConvert ? await convert(id, signal) : null;
  if (!copy) {
    // Кодек оригинала записывается, чтобы следующий прогон не читал его заново;
    // H.264 здесь записать нельзя — это неправда про файл, который остался.
    if (codec) await markCodec(id, codec, signal);
    return 'failed';
  }
  const uploaded = await upload(copy, signal);
  // Сервер хранит не то, что мы отправили: подменять нечем (ADR-0189).
  if (uploaded.id === id || uploaded.sizeBytes !== copy.size) return 'failed';
  await replace(id, uploaded.id, signal);
  return 'converted';
}

export async function runCodecBackfill(
  params: RunCodecBackfillParams,
): Promise<CodecBackfillRunResult> {
  const { signal, listPending, onProgress } = params;
  let { total } = params;
  const count: Record<VideoOutcome, number> = { converted: 0, alreadyH264: 0, failed: 0 };
  // Уже тронутые в этом прогоне: список без смещения отдаёт ту же голову, пока
  // видео не стало H.264, и без этого фильтра не перегнавшиеся крутились бы по
  // кругу. Оборотная сторона: если первая пачка (VIDEOS_CODEC_PENDING_BATCH)
  // целиком не перегналась, до остальных видео этот прогон не дойдёт.
  const handled = new Set<string>();

  const snapshot = (): CodecBackfillProgress => ({ ...count, total });
  const finish = (error: string | null, cancelled = false): CodecBackfillRunResult => ({
    ...snapshot(),
    error,
    cancelled,
  });

  while (!signal.aborted) {
    const next = await nextPendingBatch(listPending, handled, signal, FAILURE_MESSAGES);
    if (next.status === 'cancelled') break;
    if (next.status === 'done') return finish(null);
    if (next.status === 'failed') return finish(next.message);
    total ??= next.ids.length;

    for (const id of next.ids) {
      handled.add(id);
      try {
        count[await handleVideo(id, params)] += 1;
      } catch (error) {
        if (signal.aborted) return finish(null, true);
        if (isNoAccess(error)) return finish(NO_ACCESS_MESSAGE);
        count.failed += 1;
      }
      if (signal.aborted) return finish(null, true);
      total = Math.max(total, count.converted + count.alreadyH264 + count.failed);
      onProgress(snapshot());
    }
  }
  return finish(null, true);
}
