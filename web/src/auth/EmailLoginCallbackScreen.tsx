// Страница ссылки из письма входа (`/login/email?token=…`, ADR-0029). Токен
// тратится POST-ом по нажатию «Войти», не при открытии страницы (SECURITY
// §2) — сканеры почтовых клиентов открывают ссылки из письма сами и молча
// сожгли бы его раньше пользователя. Логика запроса — useEmailLoginVerify.ts.
// Уже вошедшего (открыл ссылку письма при активной сессии) уводит на
// сохранённый адрес или домашний экран, не жёстко на /schedule (аудит L2).
// Облик — та же колонка на бумаге, что у экрана входа (EntryColumn.tsx).
import type { CSSProperties } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { EntryColumn } from '../components/EntryColumn';
import { screenExplanationStyle, screenTitleStyle } from '../components/screenLayout';
import { useAuth } from './AuthProvider';
import { EMAIL_LOGIN_TOKEN_RE } from './email-login-token-format';
import { postLoginPath } from './returnTo';
import { useEmailLoginVerify } from './useEmailLoginVerify';

const INCOMPLETE_LINK_MESSAGE = 'Ссылка неполная. Запросите новую на странице входа.';

const errorTextStyle: CSSProperties = { margin: 0, color: 'var(--danger)' };
const fullWidthStyle: CSSProperties = { width: '100%' };

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

  if (authStatus === 'ok') return <Navigate to={postLoginPath()} replace />;

  const token = searchParams.get('token');
  const hasValidToken = token !== null && EMAIL_LOGIN_TOKEN_RE.test(token);

  function goToLogin(): void {
    void navigate('/login');
  }

  if (!hasValidToken) {
    return (
      <EntryColumn>
        <h1 style={screenTitleStyle}>Ссылка не подошла</h1>
        <p role="alert" style={screenExplanationStyle}>
          {INCOMPLETE_LINK_MESSAGE}
        </p>
        {/* Контур, не киноварь: человек сюда не шёл, это тупик с одним
            выходом, а не главное действие экрана (docs/adr/0031). */}
        <Button variant="secondary" onClick={goToLogin} style={fullWidthStyle}>
          На страницу входа
        </Button>
      </EntryColumn>
    );
  }

  // joinError — вход уже состоялся (verify прошёл), не упал сам вход
  // (useEmailLoginVerify.ts, ADR-0030): отдельный экран с действием, не
  // общая ветка `error` ниже — «Запросить новую» здесь не к месту, ссылка
  // уже потрачена.
  if (joinError) {
    return (
      <EntryColumn>
        <h1 style={screenTitleStyle}>Вы вошли</h1>
        <p role="alert" style={errorTextStyle}>
          {joinError}
        </p>
        <Button onClick={continueToSchedule} style={fullWidthStyle}>
          Перейти в кабинет
        </Button>
      </EntryColumn>
    );
  }

  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>Подтвердите вход</h1>
      <p style={screenExplanationStyle}>Нажмите «Войти», чтобы открыть кабинет.</p>
      {error ? (
        <>
          <p role="alert" style={errorTextStyle}>
            {error}
          </p>
          <Button variant="secondary" onClick={goToLogin} style={fullWidthStyle}>
            Запросить новую
          </Button>
        </>
      ) : (
        <Button
          pending={verifyStatus === 'pending'}
          onClick={() => void verify(token)}
          style={fullWidthStyle}
        >
          Войти
        </Button>
      )}
    </EntryColumn>
  );
}
