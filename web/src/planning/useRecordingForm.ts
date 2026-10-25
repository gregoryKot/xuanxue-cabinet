// Оркестрация формы «Добавить запись» — состояние полей, загрузка файла записи
// (общий загрузчик video-upload/, ADR-0165, без сжатия — ADR-0180), сохранение
// (CLAUDE.md «Read-after-write» — обеспечивает addRecording из useLessons.ts),
// сброс полей после успеха. Файл и ссылка уходят одним запросом: одна запись.
import { useCallback, useState } from 'react';
import {
  LESSON_VIDEO_LIMITS,
  LESSON_VIDEO_TOO_LARGE_MESSAGE,
  type AddRecordingInput,
  type LessonVideoDto,
} from '@xuanxue/shared';
import { ApiError } from '../api/http';
import {
  useVideoUpload,
  type UseVideoUploadResult,
} from '../video-upload/useVideoUpload';
import { isVideoUploadActive } from '../video-upload/videoUploadState';
import { lessonVideoTransport } from './lessonVideoTransport';
import { toAddRecordingInput, validateRecordingForm } from './recordingFormInput';

export interface UseRecordingFormResult {
  title: string;
  url: string;
  setTitle: (value: string) => void;
  setUrl: (value: string) => void;
  /** Ход загрузки файла и его управление (рисует VideoUploadProgress). */
  upload: UseVideoUploadResult;
  /** Имя выбранного файла; `null`, пока файл не выбран. */
  fileName: string | null;
  /** Файл дошёл до сервера: `videoId` готов и уйдёт с записью. */
  isFileReady: boolean;
  /** Файл сжимается, грузится или ждёт повтора — «Добавить запись» гаснет. */
  isUploading: boolean;
  pickFile: (file: File) => void;
  removeFile: () => void;
  error: string | null;
  pending: boolean;
  submit: () => Promise<void>;
}

const ADD_RECORDING_ERROR = 'Не удалось добавить запись. Попробуйте ещё раз.';

export function useRecordingForm(
  lessonId: string,
  onAdd: (lessonId: string, input: AddRecordingInput) => Promise<void>,
): UseRecordingFormResult {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleUploaded = useCallback((video: LessonVideoDto) => setVideoId(video.id), []);
  const upload = useVideoUpload({
    createTransport: lessonVideoTransport,
    onDone: handleUploaded,
    maxBytes: LESSON_VIDEO_LIMITS.maxBytes,
    tooLargeMessage: LESSON_VIDEO_TOO_LARGE_MESSAGE,
    // Файл уже смонтирован; сжатие часа видео держало бы результат в памяти
    // вкладки (ADR-0180).
    canCompress: false,
  });
  const { selectFile, reset } = upload;

  const pickFile = useCallback(
    (file: File) => {
      setVideoId(null);
      setFileName(file.name);
      setError(null);
      selectFile(file);
    },
    [selectFile],
  );

  const removeFile = useCallback(() => {
    reset();
    setVideoId(null);
    setFileName(null);
  }, [reset]);

  async function submit(): Promise<void> {
    const invalid = validateRecordingForm(url, videoId !== null);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onAdd(lessonId, toAddRecordingInput(title, url, videoId ?? undefined));
      setTitle('');
      setUrl('');
      removeFile();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : ADD_RECORDING_ERROR);
    } finally {
      setPending(false);
    }
  }

  return {
    title,
    url,
    setTitle,
    setUrl,
    upload,
    fileName,
    isFileReady: videoId !== null,
    isUploading: isVideoUploadActive(upload.state),
    pickFile,
    removeFile,
    error,
    pending,
    submit,
  };
}
