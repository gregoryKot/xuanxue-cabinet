// Блок кнопки «Войти через Telegram» — общий кусок LoginScreen.tsx и
// JoinScreen.tsx (ADR-0030: одна и та же кнопка, разное «что дальше» после
// входа). Вынесено, чтобы не копировать логику config/offline/autoPending
// между двумя экранами (CLAUDE.md «Одна механика — один компонент», jscpd).
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { AuthConfigDto } from '@xuanxue/shared';
import { NETWORK_ERROR_MESSAGE } from '../api/http';
import { Button } from '../components/Button';
import { SkeletonLines } from '../components/Skeleton';
import { screenExplanationStyle, screenHintStyle } from '../components/screenLayout';
import { useAuth } from './AuthProvider';
import { redirectToTelegramAuth } from './telegramAuthRedirect';
import { useTelegramAuthResultLogin } from './useTelegramAuthResultLogin';

const NOT_CONFIGURED_MESSAGE =
  'Вход через Telegram не настроен. Напишите администратору школы.';

// Ошибка живёт там же, где остальные ошибки форм кабинета (Field,
// FormServerError): под действием, которое её вызвало, цветом --danger.
const errorTextStyle: CSSProperties = { margin: 0, color: 'var(--danger)' };

// Сообщение и «Повторить» — одним блоком: у абзацев на этом экране margin
// снят, вертикальный ритм держит flex-gap колонки.
const offlineBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

interface TelegramLoginSectionProps {
  config: AuthConfigDto | null;
  configStatus: 'loading' | 'ok' | 'offline';
  onReload: () => Promise<void>;
  /** По умолчанию — переход на /schedule после входа (LoginScreen); JoinScreen
   * передаёт `false` и сам решает дальнейший путь (сессия уже создана,
   * экран уходит на «Расписание» сам). */
  navigateAfterLogin?: boolean;
  /** Код ссылки-приглашения (ADR-0030/0035) — JoinScreen.tsx передаёт код
   * из /join/:code, LoginScreen.tsx не передаёт вовсе. */
  inviteCode?: string;
  /** Рендерится ниже кнопки, но не во время авто-входа по фрагменту адреса
   * (форма почты под кнопкой не должна мигать раньше скелетона). */
  children?: ReactNode;
}

export function TelegramLoginSection({
  config,
  configStatus,
  onReload,
  navigateAfterLogin = true,
  inviteCode,
  children,
}: TelegramLoginSectionProps) {
  const { refresh } = useAuth();
  const { pending: autoPending, error: autoError } = useTelegramAuthResultLogin(refresh, {
    navigateAfterLogin,
    inviteCode,
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
        <div role="alert" style={offlineBlockStyle}>
          <p style={screenExplanationStyle}>{NETWORK_ERROR_MESSAGE}</p>
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
        <p role="alert" style={screenExplanationStyle}>
          {NOT_CONFIGURED_MESSAGE}
        </p>
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
          <p style={screenHintStyle}>Тем же аккаунтом, которым вы читаете канал школы</p>
        </>
      )}

      {autoError && (
        <p role="alert" style={errorTextStyle}>
          {autoError}
        </p>
      )}

      {!autoPending && children}
    </>
  );
}
