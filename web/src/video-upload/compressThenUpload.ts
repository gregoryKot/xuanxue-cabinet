// Ветка «сжатие → загрузка» в состоянии загрузки (ADR-0165) и отказ человека от
// сжатия кнопкой «Отправить без сжатия» (отзыв владельца 2026-10-02: на хорошей
// связи сжатие только тратит время, а исходное качество нужно не всем). Вынесено
// из useVideoUpload.ts (файловый лимит, CLAUDE.md «Храповики»): хук ведёт выбор
// файла и отмену, а этот шаг знает, чем кончается сжатие — сжатым файлом или
// исходником.
import type { Dispatch, SetStateAction } from 'react';
import { combineAbortSignals } from '../api/abortSignals';
import type { compressVideo } from './compressVideo';
import { IDLE_VIDEO_UPLOAD_STATE, type VideoUploadState } from './videoUploadState';

export interface CompressThenUploadParams {
  file: File;
  /** Сигнал самого прогона: «Отменить» и новый выбор файла. */
  signal: AbortSignal;
  isCancelled: () => boolean;
  compress: typeof compressVideo;
  /** Потолок вида видео: исходник больше него сервер отвергнет, поэтому
   * отказаться от сжатия такому файлу нельзя. */
  maxBytes: number;
  setState: Dispatch<SetStateAction<VideoUploadState>>;
  /** Грузит то, что получилось: сжатый файл или исходник. */
  upload: (prepared: Blob) => void;
}

/** Запускает сжатие и по его итогу — загрузку. Возвращает «пропустить сжатие»:
 * оборвать его и грузить исходник; после конца сжатия, отмены и для файла
 * больше потолка ничего не делает. */
export function compressThenUpload(params: CompressThenUploadParams): () => void {
  const { file, signal, isCancelled, compress, maxBytes, setState, upload } = params;
  const canSkip = file.size <= maxBytes;
  const skip = new AbortController();
  let isSettled = false;

  setState({
    ...IDLE_VIDEO_UPLOAD_STATE,
    phase: 'compressing',
    totalBytes: file.size,
    canSkipCompression: canSkip,
  });
  // Отвергается сжатие только отменой (сигнал прогона или пропуск) — любой
  // другой сбой compress уже превратил в исходный файл. Если сжатие успело
  // отдать результат раньше, чем дошёл пропуск, уходит сжатый файл: вторая
  // загрузка той же выдачи не нужна.
  void compress(file, {
    signal: combineAbortSignals([signal, skip.signal]),
    onProgress: (fraction) =>
      setState((prev) => ({ ...prev, compressProgress: fraction })),
  }).then(
    (prepared) => {
      isSettled = true;
      if (!isCancelled()) upload(prepared);
    },
    () => {
      isSettled = true;
      if (!isCancelled() && skip.signal.aborted) upload(file);
    },
  );

  return () => {
    if (!canSkip || isSettled || isCancelled()) return;
    // Кнопка гаснет сразу: до начала загрузки остаётся ход промиса.
    setState((prev) => ({ ...prev, canSkipCompression: false }));
    skip.abort();
  };
}
