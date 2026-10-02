// Чистая арифметика загрузки видео частями (ADR-0137, ADR-0165) — без DOM и
// без сети: предпроверка размера, слайсер файла, следующая недостающая часть,
// доля прогресса. Одна на все виды видео-файлов: потолок и текст отказа
// приходят параметрами от того, кто загружает. Юнит-тест без DOM
// (CLAUDE.md «Тесты»).

/** Части шлются сырым телом — тот же тип, что сервер сверяет сигнатурой
 * первой части (ADR-0137), не `file.type` (тому не доверяем). */
const VIDEO_PART_CONTENT_TYPE = 'application/octet-stream';

/** `null` — файл проходит по размеру, иначе готовый текст без похода в сеть
 * (ADR-0137 «Решение», клиентская предпроверка). Потолок и текст у каждого
 * вида видео свои (ответ — 1 ГБ, видео вопроса — 50 МБ, ADR-0165). */
export function checkVideoFileSize(
  sizeBytes: number,
  maxBytes: number,
  tooLargeMessage: string,
): string | null {
  return sizeBytes > maxBytes ? tooLargeMessage : null;
}

/** Число частей по заявленному размеру файла — та же формула, что у сервера
 * (`Math.ceil(sizeBytes / partBytes)`, answer-video.mapper.ts), но ответ
 * `POST /attempts/:id/answer-video` уже несёт готовый `partCount`, эта
 * функция нужна только там, где сервера ещё не спросили (прогресс до ответа
 * на старт есть незачем — используется в тестах и как страховка). */
export function videoUploadPartCount(sizeBytes: number, partBytes: number): number {
  if (sizeBytes <= 0 || partBytes <= 0) return 0;
  return Math.max(1, Math.ceil(sizeBytes / partBytes));
}

/** Часть `partNumber` (с 1) файла — сырой `Blob` с типом сырого тела, не
 * `file.type`. Последняя часть короче остальных ровно на остаток. */
export function sliceVideoPart(file: Blob, partNumber: number, partBytes: number): Blob {
  const start = (partNumber - 1) * partBytes;
  const end = Math.min(start + partBytes, file.size);
  return file.slice(start, end, VIDEO_PART_CONTENT_TYPE);
}

/** Первая недостающая часть (с 1) — по ней браузер продолжает загрузку,
 * пропуская уже принятые сервером (ADR-0137). `null` — всё уже принято. */
export function nextMissingVideoPart(
  partCount: number,
  receivedParts: number[],
): number | null {
  const received = new Set(receivedParts);
  for (let part = 1; part <= partCount; part += 1) {
    if (!received.has(part)) return part;
  }
  return null;
}

/** Доля 0..1 для полосы прогресса — по числу частей, не по байтам: часть
 * либо принята сервером целиком, либо нет, промежуточного «долетает» у
 * сырого PUT без XHR-события прогресса не различить, а дробить полосу по
 * ещё не отправленной части незачем (CLAUDE.md «Без магических чисел»). */
export function videoUploadProgress(receivedCount: number, partCount: number): number {
  if (partCount <= 0) return 0;
  return Math.min(1, Math.max(0, receivedCount / partCount));
}
