// Страница ссылки из письма входа (`/login/email?token=…», ADR-0044,
// заменяет этот кусок ADR-0029 и SECURITY §2). Раньше токен тратился по
// нажатию «Войти»: боялись сканеров почтовых клиентов, которые открывают
// ссылки из письма сами. Теперь запрос уходит сам, из JS, сразу при
// открытии страницы (useEmailLoginVerify.ts → useCallbackLogin.ts) — сканеры
// ходят по ссылке обычным GET и скрипт не выполняют, поэтому токен всё равно
// цел до человека, а лишний экран-подтверждение убран (отзыв владельца:
// «человек пытается зайти, даже если ссылки нет — это неправильно»).
// Уже вошедшего (открыл ссылку письма при активной сессии) уводит на
// сохранённый адрес или домашний экран, ничего не отправляя на сервер —
// verify ждёт (canVerify ниже), пока AuthProvider не выяснит, что сессии
// нет: иначе оба запроса ушли бы одним тиком гонкой, и токен сгорел бы зря.
// Облик — та же колонка на бумаге, что у экрана входа (EntryColumn.tsx).
import { Navigate, useSearchParams } from 'react-router-dom';
import { INVITE_QUERY_PARAM } from '@xuanxue/shared';
import { hasSession, useAuth } from './AuthProvider';
import { CallbackInProgress } from './CallbackInProgress';
import { EMAIL_LOGIN_TOKEN_RE } from './email-login-token-format';
import { postLoginPath } from './returnTo';
import { TitledDeadEnd } from './TitledDeadEnd';
import { useEmailLoginVerify } from './useEmailLoginVerify';

const INCOMPLETE_LINK_MESSAGE = 'Ссылка неполная. Запросите новую на странице входа.';

export default function EmailLoginCallbackScreen() {
  const { status: authStatus, refresh } = useAuth();
  const [searchParams] = useSearchParams();
  // join — код ссылки-приглашения школы (ADR-0030/0036), сервер положил его
  // в ссылку письма (EmailAuthService.requestLink), если он был валиден на
  // момент запроса. undefined, если параметра нет — verify() тогда просто
  // не шлёт inviteCode (см. useEmailLoginVerify.ts).
  const joinCode = searchParams.get(INVITE_QUERY_PARAM) ?? undefined;
  const token = searchParams.get('token');
  const hasValidToken = token !== null && EMAIL_LOGIN_TOKEN_RE.test(token);
  // authStatus === 'loading' — AuthProvider ещё не знает, есть ли сессия:
  // ждём её ответа, иначе этот эффект и refresh() из AuthProvider стартуют
  // одним тиком гонкой, и токен уйдёт на сервер раньше, чем выяснится, что
  // входить не нужно (тест «уже вошедшего» ниже требует, чтобы запроса не
  // было вовсе, не просто чтобы его результат не был показан).
  const canVerify = hasValidToken && authStatus !== 'loading' && !hasSession(authStatus);
  const { error, errorStatus } = useEmailLoginVerify(
    refresh,
    canVerify ? token : null,
    joinCode,
  );

  // hasSession, не authStatus === 'ok' (ревью PR #150): заблокированного тоже
  // уводит с этого экрана — здесь ему нечего делать, а RequireAuth дальше
  // покажет ACCESS_MESSAGE вместо того, чтобы он тут снова жал «Войти».
  if (hasSession(authStatus)) return <Navigate to={postLoginPath()} replace />;

  if (!hasValidToken) {
    return <TitledDeadEnd title="Ссылка не подошла" message={INCOMPLETE_LINK_MESSAGE} />;
  }

  return (
    <CallbackInProgress
      error={error}
      errorStatus={errorStatus}
      buttonLabel="Запросить новую"
    />
  );
}
