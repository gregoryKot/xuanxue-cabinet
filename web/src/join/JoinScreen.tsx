// Ссылка-приглашение школы (`/join/:code`, ADR-0030) — публичный маршрут,
// до входа: сначала проверяем код (useJoinByInvite.ts), потом либо
// «ссылка не действует», либо вход (Telegram/email, TelegramLoginSection.tsx
// — общий кусок с LoginScreen.tsx, CLAUDE.md «Дубли»), либо, если сессия уже
// есть, сразу присоединение без лишнего клика. Облик — та же колонка на
// бумаге, что у экрана входа (components/EntryColumn.tsx, docs/adr/0031).
import type { CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { INVITE_LINK_INVALID_MESSAGE } from '@xuanxue/shared';
import { NETWORK_ERROR_MESSAGE } from '../api/http';
import { Button } from '../components/Button';
import { EntryColumn } from '../components/EntryColumn';
import { LabeledDivider } from '../components/LabeledDivider';
import { screenExplanationStyle, screenTitleStyle } from '../components/screenLayout';
import { SkeletonLines } from '../components/Skeleton';
import { useAuth } from '../auth/AuthProvider';
import { useAuthConfig } from '../auth/useAuthConfig';
import { EmailLoginForm } from '../auth/EmailLoginForm';
import { TelegramLoginSection } from '../auth/TelegramLoginSection';
import { useJoinByInvite } from './useJoinByInvite';

const errorTextStyle: CSSProperties = { margin: 0, color: 'var(--danger)' };
const fullWidthStyle: CSSProperties = { width: '100%' };

export default function JoinScreen() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { status: authStatus } = useAuth();
  const { checkStatus, joining, error, join, retryCheck } = useJoinByInvite(code);
  const { config, status: configStatus, reload } = useAuthConfig();

  if (checkStatus === 'loading' || authStatus === 'loading') {
    return (
      <EntryColumn>
        <SkeletonLines widths={['70%', '40%']} />
      </EntryColumn>
    );
  }

  if (checkStatus === 'offline') {
    return (
      <EntryColumn>
        <p role="alert" style={screenExplanationStyle}>
          {NETWORK_ERROR_MESSAGE}
        </p>
        <Button variant="secondary" onClick={retryCheck} style={fullWidthStyle}>
          Повторить
        </Button>
      </EntryColumn>
    );
  }

  if (checkStatus === 'invalid') {
    return (
      <EntryColumn>
        <h1 style={screenTitleStyle}>Ссылка не подошла</h1>
        <p role="alert" style={screenExplanationStyle}>
          {INVITE_LINK_INVALID_MESSAGE}
        </p>
        {/* Контур, не киноварь: человек шёл в школу по приглашению, а не
            на страницу входа — это запасной выход, а не главное действие
            экрана (docs/adr/0031). */}
        <Button
          variant="secondary"
          onClick={() => void navigate('/login')}
          style={fullWidthStyle}
        >
          На страницу входа
        </Button>
      </EntryColumn>
    );
  }

  // checkStatus === 'valid' ниже. Сессия уже есть, или join() уже идёт
  // (useJoinByInvite запускает его сам при authStatus 'ok') — показываем
  // тот же скелетон, что и «Подтвердите вход», отдельная колонка входа не
  // нужна: присоединение к школе — не действие пользователя, а следствие
  // того, что он уже вошёл.
  if (authStatus === 'ok' || joining) {
    return (
      <EntryColumn>
        <SkeletonLines widths={['70%', '40%']} />
        {error && (
          <>
            <p role="alert" style={errorTextStyle}>
              {error}
            </p>
            <Button variant="secondary" onClick={join} style={fullWidthStyle}>
              Повторить
            </Button>
          </>
        )}
      </EntryColumn>
    );
  }

  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>Вас пригласили в школу</h1>
      <p style={screenExplanationStyle}>
        Войдите через Telegram или почту — и сразу попадёте в кабинет, без ожидания
        подтверждения.
      </p>
      <TelegramLoginSection
        config={config}
        configStatus={configStatus}
        onReload={reload}
        navigateAfterLogin={false}
      >
        {configStatus === 'ok' && config?.emailLoginEnabled && (
          <>
            <LabeledDivider label="или по почте" />
            <EmailLoginForm inviteCode={code} />
          </>
        )}
      </TelegramLoginSection>
    </EntryColumn>
  );
}
