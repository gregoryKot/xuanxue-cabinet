// Арифметика кадра-превью (ADR-0165): размер, момент снимка и пределы — чистые
// функции без DOM и без библиотеки, сам снимок — captureVideoPoster.ts.

/** Длинная сторона кадра — 480 px: плеер показывает его до нажатия в карточке
 * экрана, а не на весь экран, и JPEG выходит в 20–60 КБ (сервер принимает до
 * `VIDEO_POSTER_LIMITS.maxBytes`, кадр лежит в той же записи, что и видео). */
const POSTER_MAX_SIDE_PX = 480;

/** Кадр берём не с нулевой секунды: первые кадры у телефонной съёмки часто
 * чёрные или смазанные (камера ещё наводится). */
const POSTER_SEEK_SECONDS = 0.5;

/** Качество JPEG: сначала приличное, если кадр вышел больше потолка — один
 * повтор пожиже, дальше сдаёмся (видео сохранится и без кадра). */
export const POSTER_JPEG_QUALITIES = [0.8, 0.5] as const;

/** Потолок на весь снимок кадра: на iOS без жеста `seeked` может не прийти
 * никогда, а загрузка не должна ждать украшение дольше пары секунд. Срок идёт
 * с начала загрузки, то есть кадр обычно готов задолго до `complete`. */
export const POSTER_TIMEOUT_MS = 5000;

export interface PosterSize {
  width: number;
  height: number;
}

/** Размер кадра с сохранением пропорций, длинная сторона не больше 480 px,
 * без увеличения; `null` — размеры исходника не прочитались. */
export function posterSize(width: number, height: number): PosterSize | null {
  if (!(width > 0) || !(height > 0)) return null;
  const scale = Math.min(1, POSTER_MAX_SIDE_PX / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Секунда клипа для снимка: 0,5 с или середина, если клип короче секунды;
 * длительность не известна — те же 0,5 с (браузер возьмёт последний кадр). */
export function posterSeekTime(durationSeconds: number | null | undefined): number {
  if (
    durationSeconds == null ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return POSTER_SEEK_SECONDS;
  }
  return Math.min(POSTER_SEEK_SECONDS, durationSeconds / 2);
}
