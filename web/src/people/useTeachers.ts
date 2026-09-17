// Список ведущих для select'а «Ведущий» (docs/PLAN.md §6 п.2, аудит В4) —
// GET /users/teachers, доступен и учителю, и админу (не только «Люди»).
// Read-only: мутаций нет, сохраняет только выбранный id (ClassFormFields/
// LessonFormFields). Гонка запросов и разбор ошибки — общий
// hooks/useAbortableFetch.ts, по образцу schedule/useClasses.ts.
import { type TeacherOptionDto } from '@xuanxue/shared';
import { TEACHERS_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить список учителей. Попробуйте ещё раз.';

export interface UseTeachersResult {
  teachers: TeacherOptionDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useTeachers(): UseTeachersResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<TeacherOptionDto[]>(TEACHERS_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  return { teachers: data, loading, error, reload };
}
