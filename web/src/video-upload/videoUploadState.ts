// Состояние загрузки видео для экрана (ADR-0137): фазы и счётчики, из которых
// рисуется полоса прогресса (VideoUploadProgress.tsx). Отдельный файл от хука
// (useVideoUpload.ts), чтобы вёрстка не тянула хук ради типа.
import type { FormError } from '../components/FormServerError';

type VideoUploadPhase =
  'idle' | 'uploading' | 'waiting' | 'cancelled' | 'done' | 'failed';

export interface VideoUploadState {
  phase: VideoUploadPhase;
  /** Число частей, уже принятых сервером — не байт: сырой `PUT` без XHR не
   * даёт промежуточного прогресса внутри одной части (videoUploadParts.ts). */
  sentParts: number;
  partCount: number;
  totalBytes: number;
  partBytes: number;
  /** Только `phase: 'failed'` — текст сервера или общий запасной. */
  error: FormError | null;
}

export const IDLE_VIDEO_UPLOAD_STATE: VideoUploadState = {
  phase: 'idle',
  sentParts: 0,
  partCount: 0,
  totalBytes: 0,
  partBytes: 0,
  error: null,
};

/** Загрузка идёт прямо сейчас (в том числе стоит на паузе до повтора) — по
 * этому признаку экран прячет выбор файла и показывает полосу, а подвал формы
 * отказывает «Отправить» (useUploadActiveMark.ts, аудит 2026-10-01). */
export function isVideoUploadActive(state: VideoUploadState): boolean {
  return state.phase === 'uploading' || state.phase === 'waiting';
}
