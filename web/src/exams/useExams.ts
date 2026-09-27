// Данные экрана «Экзамены» — список с фильтрами: создание и правка уехали на
// страницу редактора (useExamEditor.ts, ADR-0033), и после них экран
// возвращается сюда, перечитывая список с нуля. Массовое удаление (ADR-0141)
// правит список прямо здесь: `removeFromList` патчит уже загруженные данные
// из ответа `POST /exams/bulk-delete`, второй `GET` не нужен (ADR-0087).
import { useEffect, useRef } from 'react';
import type { ExamDto } from '@xuanxue/shared';
import { examsListPath, type ExamListFilters } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { withoutIds } from '../lib/listPatch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить экзамены. Попробуйте ещё раз.';

export interface UseExamsResult {
  exams: ExamDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  removeFromList: (ids: string[]) => void;
}

export function useExams(filters: ExamListFilters): UseExamsResult {
  const { data, loading, error, reload, applyData } = useAbortableFetch(
    (signal) => apiFetch<ExamDto[]>(examsListPath(filters), { signal }),
    LOAD_ERROR_MESSAGE,
  );

  // Как useExamItems.ts: первый рендер уже сделал запрос сам, этот эффект
  // перечитывает список только на смену фильтров после монтирования.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void reload();
  }, [filters.status, reload]);

  return {
    exams: data,
    loading,
    error,
    reload,
    removeFromList: (ids) => applyData((prev) => withoutIds(prev, ids)),
  };
}
