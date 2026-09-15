// Данные страницы редактора экзамена — `/exams/new` и `/exams/:examId`
// (ADR-0033: редактор стал обычной страницей с адресом, а не листом поверх
// списка). Один экзамен читается своим `GET /exams/:id`, а не выбирается из
// загруженного списка: страницу открывают по ссылке, списка рядом может не
// быть вовсе. У нового экзамена читать нечего — запрос не уходит.
import { useCallback } from 'react';
import type { CreateExamInput, ExamDto, UpdateExamInput } from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось открыть экзамен. Попробуйте ещё раз.';

export interface UseExamEditorResult {
  /** `null` — новый экзамен, его ещё нет на сервере. */
  exam: ExamDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (input: CreateExamInput) => Promise<void>;
  update: (id: string, input: UpdateExamInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useExamEditor(examId: string | undefined): UseExamEditorResult {
  // Путь считаем в рендере, а не внутри колбэка: у нового экзамена колбэк не
  // вызывается вовсе, и ветка «идентификатора нет» осталась бы непроверенной.
  const path = examId === undefined ? '' : `/exams/${examId}`;
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<ExamDto>(path, { signal }),
    LOAD_ERROR_MESSAGE,
    { enabled: examId !== undefined },
  );

  // Перечитывать экзамен после сохранения незачем: страница уходит на список
  // (`navigate('/exams')`), и свежий ответ придёт туда — здесь его некому
  // показать.
  const create = useCallback(async (input: CreateExamInput) => {
    await apiFetch('/exams', { method: 'POST', body: input });
  }, []);

  const update = useCallback(async (id: string, input: UpdateExamInput) => {
    await apiFetch(`/exams/${id}`, { method: 'PATCH', body: input });
  }, []);

  const remove = useCallback(async (id: string) => {
    await apiFetch(`/exams/${id}`, { method: 'DELETE' });
  }, []);

  return { exam: data, loading, error, reload, create, update, remove };
}
