// Ветка «сжатие → загрузка» в состоянии загрузки (ADR-0165) и отказ человека от
// сжатия кнопкой «Отправить без сжатия» (отзыв владельца 2026-10-02: на хорошей
// связи сжатие только тратит время, а исходное качество нужно не всем). Вынесено
// из useVideoUpload.ts (файловый лимит, CLAUDE.md «Храповики»): хук ведёт выбор
// файла и отмену, а этот шаг знает, чем кончается сжатие — сжатым файлом или
// исходником. Видео не в H.264 перегоняется всегда и без отказа (ADR-0188).
import { H264_VIDEO_CODEC, type VideoCodec } from '@xuanxue/shared';
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
  /** Грузит то, что получилось: сжатый файл или исходник, с кодеком, если он
   * известен (ADR-0189). */
  upload: (prepared: Blob, codec?: VideoCodec) => void;
}

/** Запускает сжатие и по его итогу — загрузку. Возвращает «пропустить сжатие»:
 * оборвать его и грузить исходник; до того, как библиотека прочитала кодек, после
 * конца сжатия, отмены, для файла больше потолка и для видео не в H.264 ничего
 * не делает. */
export function compressThenUpload(params: CompressThenUploadParams): () => void {
  const { file, signal, isCancelled, compress, maxBytes, setState, upload } = params;
  const isUnderLimit = file.size <= maxBytes;
  const skip = new AbortController();
  let isSettled = false;
  // Кнопка появляется, только когда кодек прочитан и это H.264: пока он неизвестен,
  // нажатие могло бы отправить HEVC, который у части зрителей не откроется.
  let canSkip = false;

  setState({
    ...IDLE_VIDEO_UPLOAD_STATE,
    phase: 'compressing',
    totalBytes: file.size,
  });
  // Отвергается сжатие только отменой (сигнал прогона или пропуск) — любой
  // другой сбой compress уже превратил в исходный файл. Если сжатие успело
  // отдать результат раньше, чем дошёл пропуск, уходит сжатый файл: вторая
  // загрузка той же выдачи не нужна.
  void compress(file, {
    signal: combineAbortSignals([signal, skip.signal]),
    onProgress: (fraction) =>
      setState((prev) => ({ ...prev, compressProgress: fraction })),
    onConversionStart: (info) => {
      canSkip = isUnderLimit && info.canSkip;
      if (!canSkip || isSettled || isCancelled()) return;
      setState((prev) => ({ ...prev, canSkipCompression: true }));
    },
  }).then(
    ({ file: prepared, codec }) => {
      isSettled = true;
      if (!isCancelled()) upload(prepared, codec);
    },
    () => {
      isSettled = true;
      // Кнопка пропуска есть только у H.264, так что исходник — avc (ADR-0189).
      if (!isCancelled() && skip.signal.aborted) upload(file, H264_VIDEO_CODEC);
    },
  );

  return () => {
    if (!canSkip || isSettled || isCancelled()) return;
    // Кнопка гаснет сразу: до начала загрузки остаётся ход промиса.
    setState((prev) => ({ ...prev, canSkipCompression: false }));
    skip.abort();
  };
}
