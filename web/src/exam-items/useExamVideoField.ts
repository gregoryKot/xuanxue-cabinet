// Оркестрация одного поля видео (useVideoAttach.tsx, ADR-0133) — загрузка
// файла в R2 или ссылка, состояние и ошибки формы, без React в самой логике
// проверки ссылки (examVideoFormInput.ts, CLAUDE.md «Тесты»). Файл грузит
// общий загрузчик (video-upload/useVideoUpload.ts, ADR-0165) — тот же, что у
// видео-ответа ученика: сжатие в браузере, части с продолжением после обрыва,
// «Отменить», экран не гаснет. Один хук на обе механики (не два), потому что
// видно разом только одна из них — `fileStorageEnabled` решает, что показывать
// (ADR-0133): второй хук держал бы состояние, которое экран никогда не
// покажет вместе с первым.
import { useState } from 'react';
import { EXAM_VIDEO_LIMITS, EXAM_VIDEO_TOO_LARGE_MESSAGE } from '@xuanxue/shared';
import { useVideoUpload } from '../video-upload/useVideoUpload';
import type { VideoUploadState } from '../video-upload/videoUploadState';
import { examVideoTransport } from './examVideoTransport';
import { validateExamVideoUrl, type ExamVideoValue } from './examVideoFormInput';

export interface UseExamVideoFieldResult {
  /** Ход загрузки файла: сжатие, части, пауза, отмена, отказ сервера (его
   * текст — в `upload.error`, рисует VideoUploadProgress). */
  upload: VideoUploadState;
  /** Ошибка сохранения ссылки — файл и ссылка не видны разом, поэтому слот
   * один. Ошибки загрузки файла сюда не попадают: они в `upload`. */
  error: string | null;
  /** Черновик ссылки, пока она не подтверждена (`commitUrl`) — своя ссылка на
   * YouTube и подобное вводится по буквам, коммитить её на каждый символ
   * означало бы дёргать превью и валидацию посреди набора. */
  urlDraft: string;
  setUrlDraft: (value: string) => void;
  uploadFile: (file: File) => void;
  /** «Отменить» на полосе загрузки. */
  cancelUpload: () => void;
  /** «Продолжить сейчас» на паузе перед повтором. */
  resumeUpload: () => void;
  /** «Отправить без сжатия» на полосе сжатия. */
  skipCompression: () => void;
  /** Подтверждает `urlDraft` — валидный `https://` уходит в форму через
   * `onChange`, невалидный останется в поле с текстом ошибки под ним. */
  commitUrl: () => void;
  /** Снимает видео (и файл, и ссылку) — «Убрать видео» в useVideoAttach. */
  clear: () => void;
}

export function useExamVideoField(
  onChange: (next: ExamVideoValue) => void,
): UseExamVideoFieldResult {
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const { state, selectFile, cancel, resumeNow, skipCompression, reset } = useVideoUpload(
    {
      createTransport: examVideoTransport,
      // Готовое видео уходит в форму ровно так же, как раньше: только id.
      onDone: (video) => onChange({ videoId: video.id }),
      maxBytes: EXAM_VIDEO_LIMITS.maxBytes,
      tooLargeMessage: EXAM_VIDEO_TOO_LARGE_MESSAGE,
    },
  );

  function commitUrl(): void {
    const trimmed = urlDraft.trim();
    const validationError = validateExamVideoUrl(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setUrlDraft('');
    onChange({ videoUrl: trimmed });
  }

  function clear(): void {
    reset();
    setUrlDraft('');
    setError(null);
    onChange({});
  }

  return {
    upload: state,
    error,
    urlDraft,
    setUrlDraft,
    uploadFile: selectFile,
    cancelUpload: cancel,
    resumeUpload: resumeNow,
    skipCompression,
    commitUrl,
    clear,
  };
}
