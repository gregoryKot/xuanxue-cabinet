// Данные экрана «Люди» — список, назначение ролей и блокировка/открытие
// доступа. Мутации `/users/:id` и `/users/:id/status` не перечитывают
// список отдельным `GET` (ADR-0087): `updateRoles`/`updateStatus` получают
// из ответа записи готовый `UserDto` и правят список на месте, `remove`
// отвечает `204` и просто выкидывает id. `GET /users` (UserRolesService.list)
// сортирует `lastLoginAt: -1` без фильтра — но ни роли, ни статус это поле
// не трогают, значит место элемента не меняется, меняется только содержимое
// (полный разбор — web/src/lib/listPatch.ts, там же — для каких списков так
// нельзя). Read-after-write (CLAUDE.md «Тесты») соблюдён: на экране остаётся
// то, что сервер вернул после записи, — из ответа самой записи. Гонка
// запросов и разбор ошибки — в общем hooks/useAbortableFetch.ts.
import { useCallback } from 'react';
import {
  LIST_LIMIT_MAX,
  type UpdateUserRolesInput,
  type UserDto,
  type UserStatus,
} from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { replacedById, withoutId } from '../lib/listPatch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить список людей. Попробуйте ещё раз.';

export interface UsePeopleResult {
  people: UserDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  updateRoles: (id: string, input: UpdateUserRolesInput) => Promise<void>;
  updateStatus: (id: string, status: UserStatus) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** `enabled` — по умолчанию `true`; `false` (ADR-0030) — teacher на /people
 * видит только ссылку-приглашение (InviteLinkCard.tsx), список учеников
 * остаётся admin (SECURITY §3), и звать `GET /users` от его имени незачем —
 * сервер всё равно ответит 403. */
export function usePeople(enabled = true): UsePeopleResult {
  const { data, loading, error, reload, applyData } = useAbortableFetch(
    (signal) => apiFetch<UserDto[]>(`/users?limit=${LIST_LIMIT_MAX}`, { signal }),
    LOAD_ERROR_MESSAGE,
    { enabled },
  );

  const updateRoles = useCallback(
    async (id: string, input: UpdateUserRolesInput) => {
      const next = await apiFetch<UserDto>(`/users/${id}`, {
        method: 'PATCH',
        body: input,
      });
      applyData((prev) => replacedById(prev, next));
    },
    [applyData],
  );

  // PATCH /users/:id/status — блокировка/открытие доступа (ADR-0036, RUNBOOK
  // §8.15); read-after-write тем же приёмом, что updateRoles.
  const updateStatus = useCallback(
    async (id: string, status: UserStatus) => {
      const next = await apiFetch<UserDto>(`/users/${id}/status`, {
        method: 'PATCH',
        body: { status },
      });
      applyData((prev) => replacedById(prev, next));
    },
    [applyData],
  );

  // DELETE /users/:id — весь набор данных пользователя разом (аудит В11,
  // UserDeletionService.deleteAllUserData); отвечает 204 без тела, поэтому
  // единственный источник правды об удалении — id, который мы уже отправили.
  const remove = useCallback(
    async (id: string) => {
      await apiFetch(`/users/${id}`, { method: 'DELETE' });
      applyData((prev) => withoutId(prev, id));
    },
    [applyData],
  );

  return { people: data, loading, error, reload, updateRoles, updateStatus, remove };
}
