// Общий шаг двух прогонов по старым видео — «Снять кадры» (ADR-0182) и
// «Перегнать видео» (ADR-0189): взять следующую пачку из списка сервера и
// отсеять видео, которые этот прогон уже трогал. Одна механика в одном месте
// (CLAUDE.md «Одна механика — один компонент»): два одинаковых цикла разъезжались
// бы при первой правке.
import { ApiError } from '../api/http';

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

/** Отказ в доступе: остальные запросы прогона получат тот же отказ, продолжать
 * незачем. */
export function isNoAccess(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === HTTP_UNAUTHORIZED || error.status === HTTP_FORBIDDEN)
  );
}

/** Тексты, которыми прогон останавливается, когда список не пришёл (у каждого
 * прогона своя кнопка в тексте). */
export interface BatchFailureMessages {
  noAccess: string;
  listFailed: string;
}

export type PendingBatch =
  | { status: 'videos'; ids: string[] }
  /** Новых видео нет: прогон дошёл до конца. */
  | { status: 'done' }
  /** Сигнал отменён, пока шёл запрос: состояние экрана уже не нужно. */
  | { status: 'cancelled' }
  /** Список не пришёл: `message` — что сказать человеку. */
  | { status: 'failed'; message: string };

/** Следующая пачка нетронутых видео. Список без смещения отдаёт ту же голову,
 * пока видео не обработано, и без `handled` не обработавшиеся крутились бы по
 * кругу; в `handled` видео попадают, когда прогон за них берётся. */
export async function nextPendingBatch(
  list: (signal: AbortSignal) => Promise<{ id: string }[]>,
  handled: ReadonlySet<string>,
  signal: AbortSignal,
  messages: BatchFailureMessages,
): Promise<PendingBatch> {
  let batch: { id: string }[];
  try {
    batch = await list(signal);
  } catch (error) {
    if (signal.aborted) return { status: 'cancelled' };
    const message = isNoAccess(error) ? messages.noAccess : messages.listFailed;
    return { status: 'failed', message };
  }
  const ids = batch.map((video) => video.id).filter((id) => !handled.has(id));
  return ids.length === 0 ? { status: 'done' } : { status: 'videos', ids };
}
