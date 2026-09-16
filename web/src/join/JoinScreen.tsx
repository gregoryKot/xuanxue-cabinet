// Ссылка-приглашение школы (`/join/:code`, ADR-0030/0034) — публичный
// маршрут, до входа: сначала проверяем код (useJoinByInvite.ts), потом
// либо «ссылка не действует», либо вход (Telegram/email,
// TelegramLoginSection.tsx — общий кусок с LoginScreen.tsx, CLAUDE.md
// «Дубли»), с кодом, переданным прямо во вход, не отдельным шагом. Уже
// вошедшего (или только что вошедшего через эту ссылку) уводит на
// «Расписание» сам. Облик — та же колонка на бумаге, что у экрана входа
// (components/EntryColumn.tsx, docs/adr/0031).
import type { CSSProperties } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
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

const fullWidthStyle: CSSProperties = { width: '100%' };

export default function JoinScreen() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { status: authStatus } = useAuth();
  const { checkStatus, retryCheck } = useJoinByInvite(code);
  const { config, status: configStatus, reload } = useAuthConfig();

  // Уже есть сессия (обычный вход по ссылке, включая active-человека,
  // который просто открыл её снова) или только что появилась (Telegram-
  // возврат на этот же URL, TelegramLoginSection.tsx с
  // navigateAfterLogin: false) — код своё дело уже сделал внутри
  // POST /auth/telegram, второй запрос не нужен.
  if (authStatus === 'ok') return <Navigate to="/schedule" replace />;

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

  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>Вас пригласили в школу</h1>
      <p style={screenExplanationStyle}>
        Войдите через Telegram или почту — и сразу попадёте в кабинет.
      </p>
      <TelegramLoginSection
        config={config}
        configStatus={configStatus}
        onReload={reload}
        navigateAfterLogin={false}
        inviteCode={code}
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
