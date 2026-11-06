// Ссылка-приглашение школы (`/join/:code`, ADR-0030/0036) — публичный
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
import { screenExplanationStyle, screenTitleStyle } from '../components/screenLayout';
import { SkeletonLines } from '../components/Skeleton';
import { TextLinkButton } from '../components/TextLinkButton';
import { hasSession, useAuth } from '../auth/AuthProvider';
import { useAuthConfig } from '../auth/useAuthConfig';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { LegalLinks } from '../legal/LegalLink';
import { OtherLoginMethods } from '../auth/OtherLoginMethods';
import { TelegramLoginSection } from '../auth/TelegramLoginSection';
import { useJoinByInvite } from './useJoinByInvite';

const fullWidthStyle: CSSProperties = { width: '100%' };
const PAGE_TITLE = 'Приглашение';
const PRIVACY_LINK_LABEL = 'Как мы храним данные';
// Под «ссылка не действует» — выход только для своих: новичку страница входа
// не поможет (без приглашения его не заведут), а кнопка «На страницу входа»
// во всю ширину вела его туда как к главному действию — ученица 2026-11-06
// так и попала в форму почты (ADR-0199). Текстовая ссылка с вопросом, для
// кого она, вместо кнопки.
const EXISTING_USER_LOGIN_LABEL = 'Уже входили раньше? На страницу входа';

export default function JoinScreen() {
  useDocumentTitle(PAGE_TITLE);
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { status: authStatus } = useAuth();
  // Оба хука включены только когда сервер уже сказал «сессии нет» (ревью PR #150):
  // при authStatus ok/blocked экран тут же уходит редиректом ниже, а звать
  // check/config незачем; при offline — тоже не дёргаем, это не «сессии нет»,
  // а «неизвестно», разбираться должен AuthProvider.retry, не этот экран.
  const enabled = authStatus === 'guest';
  const { checkStatus, retryCheck } = useJoinByInvite(code, enabled);
  const { config, status: configStatus, reload } = useAuthConfig(enabled);

  // hasSession, не authStatus === 'ok' (ревью PR #150): и обычный вход по ссылке
  // (включая active-человека, который открыл её снова), и Telegram-возврат на
  // этот же URL (TelegramLoginSection.tsx, navigateAfterLogin: false), и
  // заблокированный — код своё дело внутри POST /auth/telegram уже сделал
  // (или не сделал, для blocked), второй запрос не нужен, а решать «пускать
  // ли» дальше — дело RequireAuth на /schedule, не этого экрана.
  if (hasSession(authStatus)) return <Navigate to="/schedule" replace />;

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
        <TextLinkButton onClick={() => void navigate('/login')}>
          {EXISTING_USER_LOGIN_LABEL}
        </TextLinkButton>
      </EntryColumn>
    );
  }

  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>Вас пригласили в школу</h1>
      <p style={screenExplanationStyle}>Войдите через Telegram или почту.</p>
      {/* Здесь у человека впервые просят имя и способ входа — статья 11
          Закона о защите частной жизни требует показать политику до этого
          (ADR-0155), не только на экране входа. */}
      <LegalLinks privacyLabel={PRIVACY_LINK_LABEL} />
      <TelegramLoginSection
        config={config}
        configStatus={configStatus}
        onReload={reload}
        navigateAfterLogin={false}
        inviteCode={code}
      >
        <OtherLoginMethods
          config={config}
          configStatus={configStatus}
          inviteCode={code}
        />
      </TelegramLoginSection>
    </EntryColumn>
  );
}
