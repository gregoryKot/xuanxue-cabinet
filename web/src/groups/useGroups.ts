// Список групп школы (ADR-0193) — читают экран «Школа» (раздел «Группы») и
// форма занятия (список галочек): один хук на оба места (CLAUDE.md «Одна
// механика — один компонент»). Запись не перечитывает список отдельным `GET`
// (ADR-0087): `POST` и `PATCH` возвращают группу целиком, `DELETE` — 204.
// Порядок списка — порядок создания (`GET /groups` сортирует по `_id`), у новой
// группы он «после всех», туда же её кладёт `appended`; переименование и
// удаление не двигают остальные (web/src/lib/listPatch.ts — полный разбор).
// Ошибку записи ловит вызывающий компонент: у него свой текст и своё место.
import { useCallback } from 'react';
import type { GroupDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { appended, replacedById, withoutId } from '../lib/listPatch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить группы. Попробуйте ещё раз.';

export interface UseGroupsResult {
  groups: GroupDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Заводит группу и возвращает её — форма занятия сразу отмечает новую. */
  create: (name: string) => Promise<GroupDto>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useGroups(): UseGroupsResult {
  const { data, loading, error, reload, applyData } = useAbortableFetch(
    (signal) => apiRoute('GET /groups', { signal }),
    LOAD_ERROR_MESSAGE,
  );

  const create = useCallback(
    async (name: string) => {
      const group = await apiRoute('POST /groups', { body: { name } });
      applyData((prev) => appended(prev, group));
      return group;
    },
    [applyData],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      const group = await apiRoute('PATCH /groups/:id', {
        params: { id },
        body: { name },
      });
      applyData((prev) => replacedById(prev, group));
    },
    [applyData],
  );

  const remove = useCallback(
    async (id: string) => {
      await apiRoute('DELETE /groups/:id', { params: { id } });
      applyData((prev) => withoutId(prev, id));
    },
    [applyData],
  );

  return { groups: data, loading, error, reload, create, rename, remove };
}
