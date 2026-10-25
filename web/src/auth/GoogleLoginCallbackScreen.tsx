// Страница возврата из Google (`GOOGLE_LOGIN_CALLBACK_PATH`, ADR-0145) — одна
// на два случая, вход и привязка (`intent=link`, googleAuthRedirect.ts):
// сервер решает, что это было, по своей cookie состояния, страница всегда
// просто шлёт {code, state}. Запрос уходит сам, из JS, сразу при открытии
// страницы (useCallbackLogin.ts, общий механизм, тот же, что у
// EmailLoginCallbackScreen.tsx). Отменённый человеком выбор аккаунта
// возвращает `?error=access_denied` (возможны и другие значения `error`) —
// сервер тогда вообще не звался, отменённое нечем проверять.
//
// Сессия у пришедшего сюда есть ровно при привязке (человек уже вошёл,
// «Профиль» → «Привязать Google», GoogleLinkSection.tsx) — POST шлётся
// независимо от того, есть сессия или нет: сервер сам разберёт, ссылка
// свежая или это давний обратный переход с уже использованным code
// (тогда ответит 401, GOOGLE_LOGIN_FAILED_MESSAGE). Кнопка на тупике и на
// ошибке ведёт вошедшего назад в кабинет (сохранённый путь или домашний
// экран — тот же «Профиль», см. `redirectToGoogleLink`), а не на страницу
// входа, где вошедшему нечего делать.
import { useSearchParams } from 'react-router-dom';
import { GOOGLE_OAUTH_CODE_RE, GOOGLE_OAUTH_STATE_RE } from '@xuanxue/shared';
import { hasSession, useAuth } from './AuthProvider';
import { CallbackInProgress } from './CallbackInProgress';
import { NativeLeavingStatus } from './NativeLeavingStatus';
import { TitledDeadEnd } from './TitledDeadEnd';
import { useCallbackLogin } from './useCallbackLogin';
import { useNativeProviderCancel } from './useNativeLogin';

const INCOMPLETE_LINK_MESSAGE = 'Ссылка не подошла. Начните вход через Google заново.';
const CANCELLED_TITLE = 'Вход не завершён';
const CANCELLED_MESSAGE =
  'Вы вернулись из Google, не выбрав аккаунт. Попробуйте ещё раз.';
const RETURN_LABEL = 'Вернуться';
const LOGIN_LABEL = 'На страницу входа';

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
  // EmailLoginCallbackScreen.tsx (canVerify там же): не звать сервер раньше,
  // чем выяснится состояние сессии (оно решает только подпись кнопки ниже,
  // не сам факт запроса — привязка идёт как раз с сессией).
  const canPost = hasValidParams && authStatus !== 'loading';
  const { error, errorStatus } = useCallbackLogin(
    refresh,
    canPost && !cancelled ? { key: 'POST /auth/google', body: { code, state } } : null,
  );
  const sessionActive = hasSession(authStatus);
  const returnLabel = sessionActive ? RETURN_LABEL : LOGIN_LABEL;
  // Отмена у провайдера при входе из Daychi (ADR-0181) — сразу назад в
  // приложение с отказом, тупик ему не нужен.
  const leavingToNative = useNativeProviderCancel(cancelled);

  if (leavingToNative) return <NativeLeavingStatus />;

  if (cancelled) {
    return (
      <TitledDeadEnd
        title={CANCELLED_TITLE}
        message={CANCELLED_MESSAGE}
        buttonLabel={returnLabel}
        hasSession={sessionActive}
      />
    );
  }

  if (!hasValidParams) {
    return (
      <TitledDeadEnd
        title="Ссылка не подошла"
        message={INCOMPLETE_LINK_MESSAGE}
        buttonLabel={returnLabel}
        hasSession={sessionActive}
      />
    );
  }

  return (
    <CallbackInProgress
      error={error}
      errorStatus={errorStatus}
      buttonLabel={returnLabel}
      hasSession={sessionActive}
    />
  );
}
