// Страница возврата из Google (`GOOGLE_LOGIN_CALLBACK_PATH`, ADR-0145) — тот
// же приём, что EmailLoginCallbackScreen.tsx: запрос уходит сам, из JS, сразу
// при открытии страницы (useCallbackLogin.ts, общий механизм). Отменённый
// человеком вход Google возвращает `?error=access_denied` (возможны и другие
// значения `error`) — сервер тогда вообще не звался, отменённое нечем
// проверять. Уже вошедшего (открыл ссылку снова при активной сессии) уводит
// на сохранённый адрес или домашний экран, ничего не отправляя — тот же
// приём, что у email-экрана (`canPost` ниже, гонка с AuthProvider).
import { Navigate, useSearchParams } from 'react-router-dom';
import { GOOGLE_OAUTH_CODE_RE, GOOGLE_OAUTH_STATE_RE } from '@xuanxue/shared';
import { hasSession, useAuth } from './AuthProvider';
import { CallbackInProgress } from './CallbackInProgress';
import { postLoginPath } from './returnTo';
import { TitledDeadEnd } from './TitledDeadEnd';
import { useCallbackLogin } from './useCallbackLogin';

const INCOMPLETE_LINK_MESSAGE = 'Ссылка не подошла. Начните вход через Google заново.';
const CANCELLED_TITLE = 'Вход не завершён';
const CANCELLED_MESSAGE =
  'Вы вернулись из Google, не выбрав аккаунт. Попробуйте ещё раз.';

export default function GoogleLoginCallbackScreen() {
  const { status: authStatus, refresh } = useAuth();
  const [searchParams] = useSearchParams();
  // Google кладёт error вместо code/state, когда человек сам отменил выбор
  // аккаунта (access_denied) — конкретное значение не важно, отменённый
  // вход одинаков для любой причины.
  const cancelled = searchParams.get('error') !== null;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const hasValidParams =
    code !== null &&
    state !== null &&
    GOOGLE_OAUTH_CODE_RE.test(code) &&
    GOOGLE_OAUTH_STATE_RE.test(state);
  // authStatus === 'loading' — та же гонка с AuthProvider, что у
  // EmailLoginCallbackScreen.tsx (canVerify там же).
  const canPost = hasValidParams && authStatus !== 'loading' && !hasSession(authStatus);
  const { error, errorStatus } = useCallbackLogin(
    refresh,
    canPost && !cancelled ? { path: '/auth/google', body: { code, state } } : null,
  );

  if (hasSession(authStatus)) return <Navigate to={postLoginPath()} replace />;

  if (cancelled) {
    return <TitledDeadEnd title={CANCELLED_TITLE} message={CANCELLED_MESSAGE} />;
  }

  if (!hasValidParams) {
    return <TitledDeadEnd title="Ссылка не подошла" message={INCOMPLETE_LINK_MESSAGE} />;
  }

  return (
    <CallbackInProgress
      error={error}
      errorStatus={errorStatus}
      buttonLabel="На страницу входа"
    />
  );
}
