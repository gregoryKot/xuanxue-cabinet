// Кадр с холста → JPEG в base64 для `complete` (ADR-0165). Не больше потолка
// сервера (`VIDEO_POSTER_LIMITS.maxBytes`): вышло больше — один повтор с меньшим
// качеством, потом отказ. Холст бывает обычным (`toBlob`) и внеэкранным
// (`convertToBlob`) — Mediabunny отдаёт любой из двух.
import { VIDEO_POSTER_LIMITS } from '@xuanxue/shared';
import { POSTER_JPEG_QUALITIES } from './videoPosterPlan';

const JPEG_MIME_TYPE = 'image/jpeg';

export type PosterCanvas = HTMLCanvasElement | OffscreenCanvas;

function canvasToJpeg(canvas: PosterCanvas, quality: number): Promise<Blob | null> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: JPEG_MIME_TYPE, quality }).catch(() => null);
  }
  return new Promise((resolve) => canvas.toBlob(resolve, JPEG_MIME_TYPE, quality));
}

/** Base64 без префикса `data:` — как ждёт сервер. */
function blobToBase64(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    // `readAsDataURL` всегда отдаёт строку `data:…;base64,…`.
    reader.onload = () => resolve((reader.result as string).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/** JPEG кадра в base64 или `null`: холст не отдал картинку, она не влезла в
 * потолок даже на втором качестве, либо не прочиталась. */
export async function encodePoster(canvas: PosterCanvas): Promise<string | null> {
  for (const quality of POSTER_JPEG_QUALITIES) {
    const blob = await canvasToJpeg(canvas, quality);
    if (!blob || blob.size === 0) return null;
    if (blob.size <= VIDEO_POSTER_LIMITS.maxBytes) return blobToBase64(blob);
  }
  return null;
}
