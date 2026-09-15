// Ссылка-приглашение школы (`/join/:code`, ADR-0030) — публичный маршрут,
// до входа: сначала проверяем код (useJoinByInvite.ts), потом либо
// «ссылка не действует», либо вход (Telegram/email, TelegramLoginSection.tsx
// — общий кусок с LoginScreen.tsx, CLAUDE.md «Дубли»), либо, если сессия уже
// есть, сразу присоединение без лишнего клика.
import { useNavigate, useParams } from 'react-router-dom';
import { INVITE_LINK_INVALID_MESSAGE } from '@xuanxue/shared';
import { NETWORK_ERROR_MESSAGE } from '../api/http';
import { Button } from '../components/Button';
import { SkeletonLines } from '../components/Skeleton';
import { useAuth } from '../auth/AuthProvider';
import { useAuthConfig } from '../auth/useAuthConfig';
import { EmailLoginForm } from '../auth/EmailLoginForm';
import {
  loginCardStyle,
  loginDividerStyle,
  loginExplanationStyle,
  loginPageStyle,
  loginTitleStyle,
} from '../auth/loginScreenStyles';
import { TelegramLoginSection } from '../auth/TelegramLoginSection';
import { useJoinByInvite } from './useJoinByInvite';

export default function JoinScreen() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { status: authStatus } = useAuth();
  const { checkStatus, joining, error, join, retryCheck } = useJoinByInvite(code);
  const { config, status: configStatus, reload } = useAuthConfig();

  if (checkStatus === 'loading' || authStatus === 'loading') {
    return (
      <main style={loginPageStyle}>
        <div style={loginCardStyle}>
          <SkeletonLines widths={['70%', '40%']} />
        </div>
      </main>
    );
  }

  if (checkStatus === 'offline') {
    return (
      <main style={loginPageStyle}>
        <div style={loginCardStyle}>
          <p role="alert" style={loginExplanationStyle}>
            {NETWORK_ERROR_MESSAGE}
          </p>
          <Button variant="secondary" onClick={retryCheck} style={{ width: '100%' }}>
            Повторить
          </Button>
        </div>
      </main>
    );
  }

  if (checkStatus === 'invalid') {
    return (
      <main style={loginPageStyle}>
        <div style={loginCardStyle}>
          <h1 style={loginTitleStyle}>Ссылка не подошла</h1>
          <p role="alert" style={loginExplanationStyle}>
            {INVITE_LINK_INVALID_MESSAGE}
          </p>
          <Button onClick={() => void navigate('/login')} style={{ width: '100%' }}>
            На страницу входа
          </Button>
        </div>
      </main>
    );
  }

  // checkStatus === 'valid' ниже. Сессия уже есть, или join() уже идёт
  // (useJoinByInvite запускает его сам при authStatus 'ok') — показываем
  // тот же скелетон, что и «Подтвердите вход», отдельная карточка входа не
  // нужна: присоединение к школе — не действие пользователя, а следствие
  // того, что он уже вошёл.
  if (authStatus === 'ok' || joining) {
    return (
      <main style={loginPageStyle}>
        <div style={loginCardStyle}>
          <SkeletonLines widths={['70%', '40%']} />
          {error && (
            <>
              <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
                {error}
              </p>
              <Button variant="secondary" onClick={join} style={{ width: '100%' }}>
                Повторить
              </Button>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main style={loginPageStyle}>
      <div style={loginCardStyle}>
        <h1 style={loginTitleStyle}>Вас пригласили в кабинет школы Сюань-Сюэ</h1>
        <p style={loginExplanationStyle}>
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
              <hr style={loginDividerStyle} />
              <EmailLoginForm inviteCode={code} />
            </>
          )}
        </TelegramLoginSection>
      </div>
    </main>
  );
}
