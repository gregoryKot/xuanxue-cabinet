// Оркестрация одного поля видео (ExamVideoField.tsx, ADR-0133) — загрузка
// файла в R2 или ссылка, состояние и ошибки формы, без React в самой логике
// проверки ссылки (examVideoFormInput.ts, CLAUDE.md «Тесты»). Один хук на обе
// механики (не два), потому что видно разом только одна из них —
// `fileStorageEnabled` решает, что показывать (ADR-0133): второй хук держал
// бы состояние, которое экран никогда не покажет вместе с первым.
import { useState } from 'react';
import type { ExamVideoDto } from '@xuanxue/shared';
import { EXAM_VIDEOS_PATH } from '../api/apiPaths';
import { UPLOAD_TIMEOUT_MS, apiFetch } from '../api/http';
import { validateExamVideoUrl, type ExamVideoValue } from './examVideoFormInput';

// И сетевой ApiError (413 «Видео больше 50 МБ», 503 «R2 не подключён» и
// т.п.), и Error любого другого источника несут готовый текст по VOICE — этот
// запасной только на непредвиденное исключение, которое ни один не бросает.
const UPLOAD_ERROR_MESSAGE = 'Не удалось загрузить видео. Попробуйте ещё раз.';

export interface UseExamVideoFieldResult {
  /** Идёт загрузка файла в R2. */
  uploadPending: boolean;
  /** Ошибка загрузки файла или сохранения ссылки — виден только один способ
   * разом, поэтому один общий слот, не два. */
  error: string | null;
  /** Черновик ссылки, пока она не подтверждена (`commitUrl`) — своя ссылка на
   * YouTube и подобное вводится по буквам, коммитить её на каждый символ
   * означало бы дёргать превью и валидацию посреди набора. */
  urlDraft: string;
  setUrlDraft: (value: string) => void;
  uploadFile: (file: File) => Promise<void>;
  /** Подтверждает `urlDraft` — валидный `https://` уходит в форму через
   * `onChange`, невалидный останется в поле с текстом ошибки под ним. */
  commitUrl: () => void;
  /** Снимает видео (и файл, и ссылку) — «Убрать видео» в ExamVideoField. */
  clear: () => void;
}

export function useExamVideoField(
  onChange: (next: ExamVideoValue) => void,
): UseExamVideoFieldResult {
  const [uploadPending, setUploadPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');

  async function uploadFile(file: File): Promise<void> {
    setUploadPending(true);
    setError(null);
    try {
      // Файл уходит как есть, без лишнего прохода через canvas (в отличие от
      // картинки, exam-items/useExamImageUpload.ts) — короткий клип движения
      // сервер и так примет только до 50 МБ (EXAM_VIDEO_LIMITS.maxBytes),
      // сжимать видео в браузере — отдельная задача, которую этот PR не
      // берёт (ADR-0133 не просит переупаковку, только приём байтов).
      const dto = await apiFetch<ExamVideoDto>(EXAM_VIDEOS_PATH, {
        method: 'POST',
        body: file,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      });
      onChange({ videoId: dto.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : UPLOAD_ERROR_MESSAGE);
    } finally {
      setUploadPending(false);
    }
  }

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
    setUrlDraft('');
    setError(null);
    onChange({});
  }

  return { uploadPending, error, urlDraft, setUrlDraft, uploadFile, commitUrl, clear };
}
