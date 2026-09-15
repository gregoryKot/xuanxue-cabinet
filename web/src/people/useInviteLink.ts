// Ссылка-приглашение школы (ADR-0030) — CRUD в одну сторону: GET читает
// текущую, POST создаёт новую и сразу возвращает её (read-after-write не
// нужен отдельным reload() — ответ POST уже свежий, тот же приём, что у
// InviteLinkService.rotate() на сервере).
import { useCallback, useState } from 'react';
import type { InviteLinkDto } from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить ссылку-приглашение. Попробуйте ещё раз.';
const ROTATE_ERROR_MESSAGE = 'Не удалось создать ссылку. Попробуйте ещё раз.';

export interface UseInviteLinkResult {
  /** `null` — идёт загрузка или сбой (см. `error`); `{ url: null }` —
   * загрузилось, но ссылку ещё не создавали. */
  link: InviteLinkDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  rotating: boolean;
  rotateError: string | null;
  rotate: () => Promise<void>;
}

export function useInviteLink(): UseInviteLinkResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<InviteLinkDto>('/users/invite-link', { signal }),
    LOAD_ERROR_MESSAGE,
  );
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [rotated, setRotated] = useState<InviteLinkDto | null>(null);

  const rotate = useCallback(async () => {
    setRotating(true);
    setRotateError(null);
    try {
      const next = await apiFetch<InviteLinkDto>('/users/invite-link', {
        method: 'POST',
      });
      setRotated(next);
    } catch {
      setRotateError(ROTATE_ERROR_MESSAGE);
    } finally {
      setRotating(false);
    }
  }, []);

  return {
    // rotated — свежее того, что вернул GET: та же карточка, не пришлось
    // ждать второй сетевой запрос, чтобы показать новую ссылку.
    link: rotated ?? data,
    loading,
    error,
    reload,
    rotating,
    rotateError,
    rotate,
  };
}
