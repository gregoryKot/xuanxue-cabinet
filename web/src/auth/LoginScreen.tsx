// Экран входа — до первого действия объясняет, что это и зачем (CLAUDE.md
// «Продукт»). Один способ входа — кнопка «Войти через Telegram»
// (window.Telegram.Login.auth(), см. useTelegramLogin.ts) на десктопе и
// автозавершение из #tgAuthResult= на мобильном (useTelegramAuthResultLogin.ts,
// баг с прода 2026-09-08); email/Google — следующие PR. Уже вошедшего уводит
// на /schedule, не показывая эту форму.
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/http';
import { Button } from '../components/Button';
import { SkeletonLines } from '../components/Skeleton';
import { useAuth } from './AuthProvider';
import { useAuthConfig } from './useAuthConfig';
import {
  postTelegramLogin,
  useTelegramAuthResultLogin,
} from './useTelegramAuthResultLogin';
import { useTelegramLogin } from './useTelegramLogin';

const NOT_CONFIGURED_MESSAGE =
  'Вход через Telegram не настроен. Напишите администратору школы.';
const OFFLINE_MESSAGE = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
const LOGIN_FAILED_MESSAGE = 'Не удалось войти. Попробуйте ещё раз.';
// Окно Telegram закрылось, а подтверждения не пришло. Так бывает, когда его
// закрыли сами, и когда браузер не отдал виджету cookie Telegram (Safari режет
// третьесторонние). Молчать здесь нельзя: экран выглядит так, будто нажатие не
// сработало (отзыв владельца 2026-09-10).
const LOGIN_CANCELLED_MESSAGE =
  'Telegram закрыл окно, а вход не подтвердился. Попробуйте ещё раз и разрешите всплывающие окна для сайта, если браузер их блокирует.';

export default function LoginScreen() {
  const navigate = useNavigate();
  const { status: authStatus, refresh } = useAuth();
  const { config, status: configStatus, reload } = useAuthConfig();
  const { ready, login } = useTelegramLogin(config?.telegramBotId);
  const { pending: autoPending, error: autoError } = useTelegramAuthResultLogin(refresh);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authStatus === 'ok') return <Navigate to="/schedule" replace />;

  async function handleLoginClick() {
    setError(null);
    setPending(true);
    try {
      const outcome = await login();
      // Увели вкладку на Telegram (телефон) — ждать здесь нечего, результат
      // придёт фрагментом адреса на возврате (useTelegramAuthResultLogin).
      if (outcome.kind === 'redirected') return;
      if (outcome.kind === 'cancelled') {
        setError(LOGIN_CANCELLED_MESSAGE);
        return;
      }
      await postTelegramLogin(outcome.user);
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

      {/* Фрагмент #tgAuthResult= есть — вход уже идёт сам, кнопку не
          показываем: на телефоне она иначе на мгновение мигает раньше
          скелетона (CLAUDE.md «Фронтенд» — скелетон по форме контента). */}
      {autoPending && <SkeletonLines widths={['70%', '40%']} />}

      {!autoPending && configStatus === 'loading' && (
        <SkeletonLines widths={['70%', '40%']} />
      )}

      {!autoPending && configStatus === 'offline' && (
        <div role="alert">
          <p style={{ margin: '0 0 8px' }}>{OFFLINE_MESSAGE}</p>
          <Button variant="secondary" onClick={() => void reload()}>
            Повторить
          </Button>
        </div>
      )}

      {!autoPending && configStatus === 'ok' && !config?.telegramBotId && (
        <p role="alert">{NOT_CONFIGURED_MESSAGE}</p>
      )}

      {!autoPending && configStatus === 'ok' && config?.telegramBotId && (
        <Button
          pending={pending}
          disabled={!ready}
          onClick={() => void handleLoginClick()}
        >
          Войти через Telegram
        </Button>
      )}

      {(error || autoError) && (
        <p role="alert" style={{ color: 'var(--danger)' }}>
          {error ?? autoError}
        </p>
      )}
    </main>
  );
}
