// Данные экрана «Люди» — список, назначение ролей и блокировка/открытие
// доступа (CLAUDE.md «Read-after-write»): после PATCH список перечитывается
// заново, как у useChannels.  Гонка запросов и разбор ошибки — в общем
// hooks/useAbortableFetch.ts.
import { useCallback } from 'react';
import {
  LIST_LIMIT_MAX,
  type UpdateUserRolesInput,
  type UserDto,
  type UserStatus,
} from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

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
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<UserDto[]>(`/users?limit=${LIST_LIMIT_MAX}`, { signal }),
    LOAD_ERROR_MESSAGE,
    { enabled },
  );

  const updateRoles = useCallback(
    async (id: string, input: UpdateUserRolesInput) => {
      await apiFetch(`/users/${id}`, { method: 'PATCH', body: input });
      await reload();
    },
    [reload],
  );

  // PATCH /users/:id/status — блокировка/открытие доступа (ADR-0036, RUNBOOK
  // §8.15); read-after-write тем же приёмом, что updateRoles.
  const updateStatus = useCallback(
    async (id: string, status: UserStatus) => {
      await apiFetch(`/users/${id}/status`, { method: 'PATCH', body: { status } });
      await reload();
    },
    [reload],
  );

  // DELETE /users/:id — весь набор данных пользователя разом (аудит В11,
  // UserDeletionService.deleteAllUserData); read-after-write тем же приёмом,
  // что updateRoles.
  const remove = useCallback(
    async (id: string) => {
      await apiFetch(`/users/${id}`, { method: 'DELETE' });
      await reload();
    },
    [reload],
  );

  return { people: data, loading, error, reload, updateRoles, updateStatus, remove };
}
