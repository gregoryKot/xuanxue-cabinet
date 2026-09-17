// Страница ссылки из письма входа (`/login/email?token=…`, ADR-0029). Токен
// тратится POST-ом по нажатию «Войти», не при открытии страницы (SECURITY
// §2) — сканеры почтовых клиентов открывают ссылки из письма сами и молча
// сожгли бы его раньше пользователя. Логика запроса — useEmailLoginVerify.ts.
// Уже вошедшего (открыл ссылку письма при активной сессии) уводит на
// сохранённый адрес или домашний экран, не жёстко на /schedule (аудит L2).
// Облик — та же колонка на бумаге, что у экрана входа (EntryColumn.tsx).
import type { CSSProperties } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { INVITE_QUERY_PARAM } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { EntryColumn } from '../components/EntryColumn';
import { screenExplanationStyle, screenTitleStyle } from '../components/screenLayout';
import { hasSession, useAuth } from './AuthProvider';
import { EMAIL_LOGIN_TOKEN_RE } from './email-login-token-format';
import { postLoginPath } from './returnTo';
import { useEmailLoginVerify } from './useEmailLoginVerify';

const INCOMPLETE_LINK_MESSAGE = 'Ссылка неполная. Запросите новую на странице входа.';

// 403 (ревью PR #150) — нет валидной ссылки-приглашения (NO_INVITE_LINK_MESSAGE)
// или blocked (ACCESS_MESSAGE): новое письмо не поможет ни в том, ни в
// другом случае, «Запросить новую» вернула бы в ту же петлю. Приписка вместо
// кнопки — конкретное действие (docs/VOICE.md): где взять ссылку.
const INVITE_HINT_MESSAGE =
  'Ссылку-приглашение вам даст учитель школы. Откройте её и войдите ещё раз.';
const FORBIDDEN_STATUS = 403;

const errorTextStyle: CSSProperties = { margin: 0, color: 'var(--danger)' };
const fullWidthStyle: CSSProperties = { width: '100%' };

export default function EmailLoginCallbackScreen() {
  const { status: authStatus, refresh } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // join — код ссылки-приглашения школы (ADR-0030/0035), сервер положил его
  // в ссылку письма (EmailAuthService.requestLink), если он был валиден на
  // момент запроса. undefined, если параметра нет — verify() тогда просто
  // не шлёт inviteCode (см. useEmailLoginVerify.ts).
  const joinCode = searchParams.get(INVITE_QUERY_PARAM) ?? undefined;
  const {
    status: verifyStatus,
    error,
    errorStatus,
    verify,
  } = useEmailLoginVerify(refresh, joinCode);

  // hasSession, не authStatus === 'ok' (ревью PR #150): заблокированного тоже
  // уводит с этого экрана — здесь ему нечего делать, а RequireAuth дальше
  // покажет ACCESS_MESSAGE вместо того, чтобы он тут снова жал «Войти».
  if (hasSession(authStatus)) return <Navigate to={postLoginPath()} replace />;

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

  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>Подтвердите вход</h1>
      <p style={screenExplanationStyle}>Нажмите «Войти», чтобы открыть кабинет.</p>
      {error ? (
        <>
          <p role="alert" style={errorTextStyle}>
            {error}
          </p>
          {errorStatus === FORBIDDEN_STATUS ? (
            <p style={screenExplanationStyle}>{INVITE_HINT_MESSAGE}</p>
          ) : (
            <Button variant="secondary" onClick={goToLogin} style={fullWidthStyle}>
              Запросить новую
            </Button>
          )}
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
