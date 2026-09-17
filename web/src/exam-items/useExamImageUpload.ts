// Загрузка картинки варианта ответа из редактора вопроса (ADR-0035): ужимает
// файл в браузере (examImageFile.ts) и грузит готовое тело в
// POST /exam-images — хук, не сам компонент (CLAUDE.md «Логика вне
// контроллеров и компонентов»: тестируется без DOM).
import { useState } from 'react';
import type { ExamImageDto } from '@xuanxue/shared';
import { EXAM_IMAGES_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { prepareExamImage } from '../lib/examImageFile';

// И сетевой ApiError, и Error из prepareExamImage (файл слишком большой,
// формат не читается) несут готовый текст по VOICE — этот запасной только
// на непредвиденное исключение, которое ни один из них не бросает сейчас.
const UPLOAD_ERROR_MESSAGE = 'Не удалось загрузить картинку. Попробуйте ещё раз.';

export interface UseExamImageUploadResult {
  /** `null` — не удалось: `error` уже заполнен, вариант остаётся без картинки. */
  upload: (file: File) => Promise<string | null>;
  pending: boolean;
  error: string | null;
}

export function useExamImageUpload(): UseExamImageUploadResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<string | null> {
    setPending(true);
    setError(null);
    try {
      const blob = await prepareExamImage(file);
      const dto = await apiFetch<ExamImageDto>(EXAM_IMAGES_PATH, {
        method: 'POST',
        body: blob,
      });
      return dto.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : UPLOAD_ERROR_MESSAGE);
      return null;
    } finally {
      setPending(false);
    }
  }

  return { upload, pending, error };
}
