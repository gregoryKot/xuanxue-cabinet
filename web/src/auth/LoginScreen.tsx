// Экран входа — до первого действия объясняет, что это и зачем (CLAUDE.md
// «Продукт»). Один способ входа — кнопка «Войти через Telegram»
// (window.Telegram.Login.auth(), см. useTelegramLogin.ts); email/Google —
// следующие PR. Уже вошедшего уводит на /schedule, не показывая эту форму.
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { TelegramLoginInput } from '@xuanxue/shared';
import { ApiError, apiFetch } from '../api/http';
import { Button } from '../components/Button';
import { SkeletonLines } from '../components/Skeleton';
import { useAuth } from './AuthProvider';
import { useAuthConfig } from './useAuthConfig';
import { useTelegramLogin } from './useTelegramLogin';

const NOT_CONFIGURED_MESSAGE =
  'Вход через Telegram не настроен. Напишите администратору школы.';
const OFFLINE_MESSAGE = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
const LOGIN_FAILED_MESSAGE = 'Не удалось войти. Попробуйте ещё раз.';

export default function LoginScreen() {
  const navigate = useNavigate();
  const { status: authStatus, refresh } = useAuth();
  const { config, status: configStatus, reload } = useAuthConfig();
  const { ready, login } = useTelegramLogin(config?.telegramBotId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authStatus === 'ok') return <Navigate to="/schedule" replace />;

  async function handleLoginClick() {
    setError(null);
    setPending(true);
    try {
      const user = await login();
      if (!user) return; // попап закрыт без входа — не ошибка
      await postTelegramLogin(user);
      await refresh();
      void navigate('/schedule', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : LOGIN_FAILED_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <main
      style={{
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 420,
      }}
    >
      <h1 style={{ fontSize: 22, margin: 0 }}>Кабинет школы Сюань-Сюэ</h1>
      <p style={{ margin: 0 }}>
        Здесь расписание, ссылки на занятия и записи для учителей.
      </p>
      <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
        Войдите через Telegram — тем же аккаунтом, которым вы читаете канал школы.
      </p>

      {configStatus === 'loading' && <SkeletonLines widths={['70%', '40%']} />}

      {configStatus === 'offline' && (
        <div role="alert">
          <p style={{ margin: '0 0 8px' }}>{OFFLINE_MESSAGE}</p>
          <Button variant="secondary" onClick={() => void reload()}>
            Повторить
          </Button>
        </div>
      )}

      {configStatus === 'ok' && !config?.telegramBotId && (
        <p role="alert">{NOT_CONFIGURED_MESSAGE}</p>
      )}

      {configStatus === 'ok' && config?.telegramBotId && (
        <Button
          pending={pending}
          disabled={!ready}
          onClick={() => void handleLoginClick()}
        >
          Войти через Telegram
        </Button>
      )}

      {error && (
        <p role="alert" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
    </main>
  );
}

function postTelegramLogin(user: TelegramLoginInput) {
  return apiFetch('/auth/telegram', { method: 'POST', body: user });
}
