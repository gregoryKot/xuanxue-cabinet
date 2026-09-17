// Данные страницы-редактора одной записи: прочитать её по адресу, создать,
// сохранить, удалить (ADR-0033 — редактор стал обычной страницей с адресом,
// а не листом поверх списка). Запись читается своим `GET /коллекция/:id`, а
// не выбирается из загруженного списка: страницу открывают по ссылке, списка
// рядом может не быть вовсе. У новой записи читать нечего — запрос не уходит.
//
// Общий хук на экзамен и вопрос банка: два одинаковых набора create/update/
// remove в соседних файлах jscpd ловит как дубль (CLAUDE.md «Одна механика —
// один компонент»). Домен приносит только путь коллекции и текст ошибки.
import { useCallback } from 'react';
import { entityPath } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from './useAbortableFetch';

export interface UseEntityEditorResult<TDto, TCreateInput, TUpdateInput> {
  /** `null` — новая запись, её ещё нет на сервере. */
  entity: TDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (input: TCreateInput) => Promise<void>;
  update: (id: string, input: TUpdateInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useEntityEditor<TDto, TCreateInput, TUpdateInput>(
  collectionPath: string,
  id: string | undefined,
  loadErrorMessage: string,
): UseEntityEditorResult<TDto, TCreateInput, TUpdateInput> {
  // Путь считаем в рендере, а не внутри колбэка: у новой записи колбэк не
  // вызывается вовсе, и ветка «идентификатора нет» осталась бы непроверенной.
  const path = id === undefined ? '' : entityPath(collectionPath, id);
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<TDto>(path, { signal }),
    loadErrorMessage,
    { enabled: id !== undefined },
  );

  // Перечитывать запись после сохранения незачем: страница уходит на список,
  // и свежий ответ придёт туда — здесь его некому показать.
  const create = useCallback(
    async (input: TCreateInput) => {
      await apiFetch(collectionPath, { method: 'POST', body: input });
    },
    [collectionPath],
  );

  const update = useCallback(
    async (entityId: string, input: TUpdateInput) => {
      await apiFetch(entityPath(collectionPath, entityId), {
        method: 'PATCH',
        body: input,
      });
    },
    [collectionPath],
  );

  const remove = useCallback(
    async (entityId: string) => {
      await apiFetch(entityPath(collectionPath, entityId), { method: 'DELETE' });
    },
    [collectionPath],
  );

  return { entity: data, loading, error, reload, create, update, remove };
}
