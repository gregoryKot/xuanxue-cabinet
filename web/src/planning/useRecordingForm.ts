// Оркестрация формы «Добавить запись» — состояние двух полей, сохранение
// (CLAUDE.md «Read-after-write» — обеспечивает addRecording из useLessons.ts),
// сброс полей после успеха.
import { useState } from 'react';
import type { AddRecordingInput } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { toAddRecordingInput, validateRecordingForm } from './recordingFormInput';

export interface UseRecordingFormResult {
  title: string;
  url: string;
  setTitle: (value: string) => void;
  setUrl: (value: string) => void;
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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(): Promise<void> {
    const invalid = validateRecordingForm(url);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onAdd(lessonId, toAddRecordingInput(title, url));
      setTitle('');
      setUrl('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : ADD_RECORDING_ERROR);
    } finally {
      setPending(false);
    }
  }

  return { title, url, setTitle, setUrl, error, pending, submit };
}
