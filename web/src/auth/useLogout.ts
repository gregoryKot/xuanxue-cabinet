// Выход из кабинета — логика кнопки в подвале AppShell.tsx, общей для
// учителя и ученика (CLAUDE.md «Одна механика — один компонент»).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiFetch } from '../api/http';
import { useAuth } from './AuthProvider';

const LOGOUT_FAILED_MESSAGE = 'Не удалось выйти. Попробуйте ещё раз.';

export interface UseLogoutResult {
  pending: boolean;
  /** Текст для `role="alert"`; `null` — ошибки нет. */
  error: string | null;
  logout: () => Promise<void>;
}

export function useLogout(): UseLogoutResult {
  const navigate = useNavigate();
  const { clear } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
      // Чистим сессию в состоянии до перехода: иначе гвард успеет увидеть
      // «вошедшего» и вернуть обратно.
      clear();
      void navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : LOGOUT_FAILED_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return { pending, error, logout };
}
