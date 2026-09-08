// Данные экрана «Планирование» — гонка запросов и разбор ошибки в общем
// useAbortableFetch (CLAUDE.md «Одна механика — один компонент», иначе дубль
// с useClasses/useSummary ловит jscpd); после create/update/addRecording —
// reload() (CLAUDE.md «Read-after-write»).
import { useCallback } from 'react';
import {
  LIST_LIMIT_MAX,
  type AddRecordingInput,
  type BroadcastDto,
  type CreateLessonInput,
  type LessonDto,
  type UpdateLessonInput,
} from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { planningWindow } from './planningWindow';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить занятия. Попробуйте ещё раз.';

export interface UseLessonsResult {
  lessons: LessonDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (input: CreateLessonInput) => Promise<void>;
  update: (id: string, input: UpdateLessonInput) => Promise<void>;
  addRecording: (id: string, input: AddRecordingInput) => Promise<void>;
  /** «Отправить ссылку сейчас» (docs/PLAN.md §6 п.3, аудит В12) — тот же
   * read-after-write, что у остальных мутаций: список статусов на карточках
   * перечитывается, чтобы бейдж занятия обновился сразу. */
  sendNow: (id: string) => Promise<void>;
}

export function useLessons(): UseLessonsResult {
  const { data, loading, error, reload } = useAbortableFetch((signal) => {
    const { from, to } = planningWindow();
    return apiFetch<LessonDto[]>(
      `/lessons?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=${LIST_LIMIT_MAX}`,
      { signal },
    );
  }, LOAD_ERROR_MESSAGE);

  const create = useCallback(
    async (input: CreateLessonInput) => {
      await apiFetch('/lessons', { method: 'POST', body: input });
      await reload();
    },
    [reload],
  );

  const update = useCallback(
    async (id: string, input: UpdateLessonInput) => {
      await apiFetch(`/lessons/${id}`, { method: 'PATCH', body: input });
      await reload();
    },
    [reload],
  );

  const addRecording = useCallback(
    async (id: string, input: AddRecordingInput) => {
      await apiFetch(`/lessons/${id}/recording`, { method: 'POST', body: input });
      await reload();
    },
    [reload],
  );

  const sendNow = useCallback(
    async (id: string) => {
      await apiFetch<BroadcastDto>(`/lessons/${id}/send-now`, { method: 'POST' });
      await reload();
    },
    [reload],
  );

  return { lessons: data, loading, error, reload, create, update, addRecording, sendNow };
}
