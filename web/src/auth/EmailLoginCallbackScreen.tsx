// Страница ссылки из письма входа (`/login/email?token=…`, ADR-0029). Токен
// тратится POST-ом по нажатию «Войти», не при открытии страницы (SECURITY
// §2) — сканеры почтовых клиентов открывают ссылки из письма сами и молча
// сожгли бы его раньше пользователя. Логика запроса — useEmailLoginVerify.ts.
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { useAuth } from './AuthProvider';
import { EMAIL_LOGIN_TOKEN_RE } from './email-login-token-format';
import {
  loginCardStyle,
  loginExplanationStyle,
  loginPageStyle,
  loginTitleStyle,
} from './loginScreenStyles';
import { useEmailLoginVerify } from './useEmailLoginVerify';

const INCOMPLETE_LINK_MESSAGE = 'Ссылка неполная. Запросите новую на странице входа.';

export default function EmailLoginCallbackScreen() {
  const { status: authStatus, refresh } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // join — код ссылки-приглашения школы (ADR-0030), сервер положил его в
  // ссылку письма (EmailAuthService.requestLink), если он был валиден на
  // момент запроса. undefined, если параметра нет — verify() тогда просто
  // не зовёт /auth/join (см. useEmailLoginVerify.ts).
  const joinCode = searchParams.get('join') ?? undefined;
  const {
    status: verifyStatus,
    error,
    joinError,
    verify,
    continueToSchedule,
  } = useEmailLoginVerify(refresh, joinCode);

  if (authStatus === 'ok') return <Navigate to="/schedule" replace />;

  const token = searchParams.get('token');
  const hasValidToken = token !== null && EMAIL_LOGIN_TOKEN_RE.test(token);

  function goToLogin(): void {
    void navigate('/login');
  }

  if (!hasValidToken) {
    return (
      <main style={loginPageStyle}>
        <div style={loginCardStyle}>
          <h1 style={loginTitleStyle}>Ссылка не подошла</h1>
          <p role="alert" style={loginExplanationStyle}>
            {INCOMPLETE_LINK_MESSAGE}
          </p>
          <Button onClick={goToLogin} style={{ width: '100%' }}>
            На страницу входа
          </Button>
        </div>
      </main>
    );
  }

  // joinError — вход уже состоялся (verify прошёл), не упал сам вход
  // (useEmailLoginVerify.ts, ADR-0030): отдельный экран с действием, не
  // общая ветка `error` ниже — «Запросить новую» здесь не к месту, ссылка
  // уже потрачена.
  if (joinError) {
    return (
      <main style={loginPageStyle}>
        <div style={loginCardStyle}>
          <h1 style={loginTitleStyle}>Вы вошли</h1>
          <p role="alert" style={{ ...loginExplanationStyle, color: 'var(--danger)' }}>
            {joinError}
          </p>
          <Button onClick={continueToSchedule} style={{ width: '100%' }}>
            Перейти в кабинет
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main style={loginPageStyle}>
      <div style={loginCardStyle}>
        <h1 style={loginTitleStyle}>Подтвердите вход</h1>
        <p style={loginExplanationStyle}>Нажмите «Войти», чтобы открыть кабинет.</p>
        {error ? (
          <>
            <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
              {error}
            </p>
            <Button variant="secondary" onClick={goToLogin} style={{ width: '100%' }}>
              Запросить новую
            </Button>
          </>
        ) : (
          <Button
            pending={verifyStatus === 'pending'}
            onClick={() => void verify(token)}
            style={{ width: '100%' }}
          >
            Войти
          </Button>
        )}
      </div>
    </main>
  );
}
