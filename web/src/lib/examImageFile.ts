// Ужатие фото варианта ответа в браузере перед загрузкой (ADR-0035,
// «Альтернативы»: `sharp` на сервере — нативный бинарник в образе ради
// операции, которую браузер делает бесплатно). Серверный потолок
// `EXAM_IMAGE_LIMITS.maxBytes` (1 МБ) — только страховка от сырого фото с
// телефона (5–8 МБ); рабочий размер после этого модуля — 150–300 КБ.
import {
  EXAM_IMAGE_CONTENT_TYPES,
  EXAM_IMAGE_LIMITS,
  EXAM_IMAGE_TOO_LARGE_MESSAGE,
  EXAM_IMAGE_UNSUPPORTED_MESSAGE,
  type ExamImageContentType,
} from '@xuanxue/shared';

export const EXAM_IMAGE_MAX_SIDE_PX = 1280;
const JPEG_QUALITY = 0.85;
const JPEG_TYPE = 'image/jpeg';

function isExamImageContentType(type: string): type is ExamImageContentType {
  return (EXAM_IMAGE_CONTENT_TYPES as readonly string[]).includes(type);
}

/** Пропорционально уменьшает `width`×`height` так, чтобы длинная сторона не
 * превышала `maxSide` — иначе (в том числе на равенстве) возвращает как
 * есть. Целые числа (`Math.round`), не меньше 1: canvas с размером 0 или
 * дробным пикселем бросает исключение. */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const longSide = Math.max(width, height);
  if (longSide <= maxSide) return { width, height };
  const scale = maxSide / longSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, JPEG_TYPE, JPEG_QUALITY));
}

/** Дорисовывает `bitmap` на canvas размера `fitWithin(…)` и кодирует в JPEG —
 * вынесено из `prepareExamImage`, чтобы `finally { bitmap.close() }` ниже
 * закрывал битмап при любом исходе, включая брошенную здесь ошибку. */
async function drawResized(bitmap: ImageBitmap): Promise<Blob> {
  const { width, height } = fitWithin(
    bitmap.width,
    bitmap.height,
    EXAM_IMAGE_MAX_SIDE_PX,
  );
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // Отсутствие 2d-контекста — не пользовательский случай (вся современная
  // браузерная база его даёт), тот же текст, что и у неподдержанного формата.
  if (!ctx) throw new Error(EXAM_IMAGE_UNSUPPORTED_MESSAGE);
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await canvasToBlob(canvas);
  if (!blob || blob.size > EXAM_IMAGE_LIMITS.maxBytes) {
    throw new Error(EXAM_IMAGE_TOO_LARGE_MESSAGE);
  }
  return blob;
}

/**
 * Готовое тело `POST /exam-images` (ADR-0035): файл уже в пределах размера
 * и формата — уходит как есть, без лишнего прохода через canvas; иначе —
 * ужатая до `EXAM_IMAGE_MAX_SIDE_PX` копия в JPEG.
 *
 * Декодировать не удалось (HEIC и часть WebP, которые `createImageBitmap`
 * браузера не читает) — при допустимом типе и размере файл уходит как есть:
 * сервер решит по сигнатуре байтов (`exam-image-upload.ts`), не по нашей
 * догадке. Иначе — честная ошибка вместо загрузки того, что сервер всё
 * равно отклонит.
 */
export async function prepareExamImage(file: File): Promise<Blob> {
  const fitsAsIs =
    isExamImageContentType(file.type) && file.size <= EXAM_IMAGE_LIMITS.maxBytes;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (fitsAsIs) return file;
    throw new Error(EXAM_IMAGE_UNSUPPORTED_MESSAGE);
  }

  try {
    const longSide = Math.max(bitmap.width, bitmap.height);
    if (fitsAsIs && longSide <= EXAM_IMAGE_MAX_SIDE_PX) return file;
    return await drawResized(bitmap);
  } finally {
    bitmap.close();
  }
}
