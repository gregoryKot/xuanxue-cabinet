// Блок кнопки «Войти через Telegram» — общий кусок LoginScreen.tsx и
// JoinScreen.tsx (ADR-0030: одна и та же кнопка, разное «что дальше» после
// входа). Вынесено, чтобы не копировать логику config/offline/autoPending
// между двумя экранами (CLAUDE.md «Одна механика — один компонент», jscpd).
import { useState, type ReactNode } from 'react';
import type { AuthConfigDto } from '@xuanxue/shared';
import { NETWORK_ERROR_MESSAGE } from '../api/http';
import { Button } from '../components/Button';
import { SkeletonLines } from '../components/Skeleton';
import { useAuth } from './AuthProvider';
import { loginCaptionStyle } from './loginScreenStyles';
import { redirectToTelegramAuth } from './telegramAuthRedirect';
import { useTelegramAuthResultLogin } from './useTelegramAuthResultLogin';

const NOT_CONFIGURED_MESSAGE =
  'Вход через Telegram не настроен. Напишите администратору школы.';

interface TelegramLoginSectionProps {
  config: AuthConfigDto | null;
  configStatus: 'loading' | 'ok' | 'offline';
  onReload: () => Promise<void>;
  /** По умолчанию — переход на /schedule после входа (LoginScreen); JoinScreen
   * передаёт `false` и сам решает дальнейший путь (POST /auth/join). */
  navigateAfterLogin?: boolean;
  /** Рендерится ниже кнопки, но не во время авто-входа по фрагменту адреса
   * (форма почты под кнопкой не должна мигать раньше скелетона). */
  children?: ReactNode;
}

export function TelegramLoginSection({
  config,
  configStatus,
  onReload,
  navigateAfterLogin = true,
  children,
}: TelegramLoginSectionProps) {
  const { refresh } = useAuth();
  const { pending: autoPending, error: autoError } = useTelegramAuthResultLogin(refresh, {
    navigateAfterLogin,
  });
  const [pending, setPending] = useState(false);
  // Локальная переменная — TS сужает `number | undefined` до `number` по ней
  // и в замыкании кнопки ниже (LoginScreen.tsx, тот же приём).
  const telegramBotId = config?.telegramBotId;

  function handleLoginClick(botId: number) {
    setPending(true);
    redirectToTelegramAuth(botId);
  }

  return (
    <>
      {autoPending && <SkeletonLines widths={['70%', '40%']} />}

      {!autoPending && configStatus === 'loading' && (
        <SkeletonLines widths={['70%', '40%']} />
      )}

      {!autoPending && configStatus === 'offline' && (
        <div role="alert">
          <p style={{ margin: '0 0 8px' }}>{NETWORK_ERROR_MESSAGE}</p>
          <Button
            variant="secondary"
            onClick={() => void onReload()}
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

      {!autoPending && children}
    </>
  );
}
