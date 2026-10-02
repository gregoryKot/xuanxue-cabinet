// Шаг «уходит на сервер» в состоянии загрузки (ADR-0137, ADR-0165): проверка
// размера у того, что действительно уйдёт, переход в `uploading` и перевод
// колбэков прогона (videoUploadRunner.ts) в состояние экрана. Вынесено из
// useVideoUpload.ts (файловый лимит, CLAUDE.md «Храповики»): хук ведёт выбор
// файла и сжатие, а этот шаг одинаков для сжатого и исходного файла.
import type { Dispatch, SetStateAction } from 'react';
import { captureVideoPoster } from './captureVideoPoster';
import { checkVideoFileSize } from './videoUploadParts';
import { runVideoUpload } from './videoUploadRunner';
import { IDLE_VIDEO_UPLOAD_STATE, type VideoUploadState } from './videoUploadState';
import type { VideoUploadTransport } from './videoUploadTypes';

export interface BeginVideoUploadParams<TResult extends object> {
  /** То, что уходит: сжатый результат или исходный файл. */
  prepared: Blob;
  transport: VideoUploadTransport<TResult>;
  signal: AbortSignal;
  isCancelled: () => boolean;
  waitForResume: (delaySec: number) => Promise<void>;
  setState: Dispatch<SetStateAction<VideoUploadState>>;
  onDone: (result: TResult) => void;
  /** Потолок размера и текст отказа у каждого вида видео свой. */
  maxBytes: number;
  tooLargeMessage: string;
}

export function beginVideoUpload<TResult extends object>(
  params: BeginVideoUploadParams<TResult>,
): void {
  const { prepared, setState, maxBytes, tooLargeMessage } = params;
  const sizeError = checkVideoFileSize(prepared.size, maxBytes, tooLargeMessage);
  if (sizeError) {
    setState({
      ...IDLE_VIDEO_UPLOAD_STATE,
      phase: 'failed',
      error: { message: sizeError },
    });
    return;
  }
  // До ответа старта размер части знает только сервер; на полосе это не видно —
  // отправлено ноль частей.
  setState({ ...IDLE_VIDEO_UPLOAD_STATE, phase: 'uploading', totalBytes: prepared.size });
  // Колбэки без своей проверки isCancelled(): прогон уже сверяет её синхронно
  // перед каждым вызовом — второй раз то же самое значение здесь не изменится,
  // а мёртвая ветка только путает читателя (CLAUDE.md «Дубли и мёртвый код»).
  void runVideoUpload({
    file: prepared,
    transport: params.transport,
    signal: params.signal,
    isCancelled: params.isCancelled,
    onProgress: (progress) => {
      setState({
        ...IDLE_VIDEO_UPLOAD_STATE,
        ...progress,
        phase: 'uploading',
        totalBytes: prepared.size,
      });
    },
    waitForResume: params.waitForResume,
    capturePoster: () => captureVideoPoster(prepared, { signal: params.signal }),
    onFailed: (error) => {
      setState((prev) => ({ ...prev, phase: 'failed', error }));
    },
    onDone: (result) => {
      params.onDone(result);
      setState({ ...IDLE_VIDEO_UPLOAD_STATE, phase: 'done' });
    },
  });
}
