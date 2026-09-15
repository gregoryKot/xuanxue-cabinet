// Экран входа — до первого действия объясняет, что это и зачем (CLAUDE.md
// «Продукт»). Единственный способ входа, на любом устройстве, — переход
// текущей вкладки на Telegram (`redirectToTelegramAuth`,
// telegramAuthRedirect.ts): попап `window.Telegram.Login.auth()` убран —
// на десктопе он оказался так же ненадёжен, как на телефоне (ADR-0028,
// отзыв владельца 2026-09-15). Возврат с Telegram дочитывает
// useTelegramAuthResultLogin.ts (баг с прода 2026-09-08). Уже вошедшего
// уводит на /schedule, не показывая эту форму. Email и Google — следующие PR.
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { NETWORK_ERROR_MESSAGE } from '../api/http';
import { Button } from '../components/Button';
import { SkeletonLines } from '../components/Skeleton';
import { useAuth } from './AuthProvider';
import { useAuthConfig } from './useAuthConfig';
import { EmailLoginForm } from './EmailLoginForm';
import {
  loginCaptionStyle,
  loginCardStyle,
  loginDividerStyle,
  loginExplanationStyle,
  loginPageStyle,
  loginTitleStyle,
} from './loginScreenStyles';
import { redirectToTelegramAuth } from './telegramAuthRedirect';
import { useTelegramAuthResultLogin } from './useTelegramAuthResultLogin';

const NOT_CONFIGURED_MESSAGE =
  'Вход через Telegram не настроен. Напишите администратору школы.';
const OFFLINE_MESSAGE = NETWORK_ERROR_MESSAGE;

export default function LoginScreen() {
  const { status: authStatus, refresh } = useAuth();
  const { config, status: configStatus, reload } = useAuthConfig();
  const { pending: autoPending, error: autoError } = useTelegramAuthResultLogin(refresh);
  const [pending, setPending] = useState(false);
  // Локальная переменная, не config?.telegramBotId в каждом месте: TS
  // сужает `number | undefined` до `number` по ней и в замыкании кнопки
  // ниже, а хук `!config?.telegramBotId` не сужается через обращение к
  // свойству — пришлось бы либо повторять проверку в обработчике (и она
  // осталась бы веткой, которую нечем покрыть тестом), либо писать `as number`.
  const telegramBotId = config?.telegramBotId;

  if (authStatus === 'ok') return <Navigate to="/schedule" replace />;

  function handleLoginClick(botId: number) {
    // Вкладка сейчас уйдёт на Telegram — кнопка остаётся занятой до
    // возврата, повторное нажатие тут не нужно и не поможет.
    setPending(true);
    redirectToTelegramAuth(botId);
  }

  return (
    <main style={loginPageStyle}>
      <div style={loginCardStyle}>
        <h1 style={loginTitleStyle}>Кабинет школы Сюань-Сюэ</h1>
        <p style={loginExplanationStyle}>
          Здесь расписание, ссылки на занятия и записи для учителей.
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
            <Button
              variant="secondary"
              onClick={() => void reload()}
              style={{ width: '100%' }}
            >
              Повторить
            </Button>
          </div>
        )}

        {!autoPending && configStatus === 'ok' && !telegramBotId && (
          <p role="alert">{NOT_CONFIGURED_MESSAGE}</p>
        )}

        {!autoPending && configStatus === 'ok' && telegramBotId && (
          <>
            <Button
              pending={pending}
              onClick={() => handleLoginClick(telegramBotId)}
              style={{ width: '100%' }}
            >
              Войти через Telegram
            </Button>
            <p style={loginCaptionStyle}>
              Тем же аккаунтом, которым вы читаете канал школы
            </p>
          </>
        )}

        {autoError && (
          <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
            {autoError}
          </p>
        )}

        {/* Нет Telegram — email-путь (ADR-0029), выключен по умолчанию, пока
            школа не подключит Resend (SECURITY §2): без этого условия форма
            звала бы 503 на каждый ввод. */}
        {!autoPending && configStatus === 'ok' && config?.emailLoginEnabled && (
          <>
            <hr style={loginDividerStyle} />
            <EmailLoginForm />
          </>
        )}
      </div>
    </main>
  );
}
