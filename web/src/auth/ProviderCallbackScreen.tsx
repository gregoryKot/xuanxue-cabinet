// Страница возврата из внешнего входа (Google — `GOOGLE_LOGIN_CALLBACK_PATH`,
// ADR-0145; Telegram по OpenID Connect — `TELEGRAM_LOGIN_CALLBACK_PATH`,
// ADR-0187). Оба провайдера возвращают вкладку одним способом — `?code=…&state=…`
// или `?error=…`, когда человек отказался, — и страница делает одно и то же:
// отказ → тупик, битая ссылка → тупик, иначе POST {code, state} сам, из JS,
// сразу при открытии (useCallbackLogin.ts). Отличается только то, что знает о
// себе провайдер (`ProviderCallback`): форматы кода и state, ключ запроса и
// тексты. Один компонент на двоих, чтобы второй вход не повторял первый целиком
// и поведение уходов в Daychi и кнопок не разъезжалось (CLAUDE.md «Одна
// механика — один компонент», jscpd).
//
// Сессия у пришедшего сюда есть при привязке Google (человек уже вошёл,
// «Профиль» → «Привязать Google») — POST шлётся независимо от того, есть
// сессия или нет: сервер сам разберёт, ссылка свежая или это давний обратный
// переход с уже использованным code (тогда ответит 401). Кнопка на тупике и на
// ошибке ведёт вошедшего назад в кабинет (сохранённый путь или домашний экран),
// а не на страницу входа, где вошедшему нечего делать.
import { useSearchParams } from 'react-router-dom';
import { hasSession, useAuth } from './AuthProvider';
import { CallbackInProgress } from './CallbackInProgress';
import { NativeLeavingStatus } from './NativeLeavingStatus';
import { TitledDeadEnd } from './TitledDeadEnd';
import { useCallbackLogin, type CallbackLoginRequest } from './useCallbackLogin';
import { useNativeProviderCancel } from './useNativeLogin';

const CANCELLED_TITLE = 'Вход не завершён';
const INCOMPLETE_LINK_TITLE = 'Ссылка не подошла';
const RETURN_LABEL = 'Вернуться';
const LOGIN_LABEL = 'На страницу входа';

/** Что страница возврата знает о провайдере входа. */
export interface ProviderCallback {
  codePattern: RegExp;
  statePattern: RegExp;
  /** Запрос на сервер по паре из адреса — к этому моменту оба значения уже
   * прошли проверку формата. */
  buildRequest: (code: string, state: string) => CallbackLoginRequest;
  /** Человек вернулся с `?error=…` — отказал у провайдера. */
  cancelledMessage: string;
  incompleteLinkMessage: string;
}

interface ProviderCallbackScreenProps {
  provider: ProviderCallback;
}

export function ProviderCallbackScreen({ provider }: ProviderCallbackScreenProps) {
  const { status: authStatus, refresh } = useAuth();
  const [searchParams] = useSearchParams();
  // Провайдер кладёт error вместо code/state, когда человек сам отказал
  // (access_denied) — конкретное значение не важно, отменённый вход одинаков
  // для любой причины.
  const cancelled = searchParams.get('error') !== null;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const params =
    code !== null &&
    state !== null &&
    provider.codePattern.test(code) &&
    provider.statePattern.test(state)
      ? { code, state }
      : null;
  // authStatus === 'loading' — та же гонка с AuthProvider, что у
  // EmailLoginCallbackScreen.tsx (canVerify там же): не звать сервер раньше,
  // чем выяснится состояние сессии (оно решает только подпись кнопки ниже,
  // не сам факт запроса — привязка идёт как раз с сессией).
  const canPost = params !== null && authStatus !== 'loading' && !cancelled;
  const { error, errorStatus } = useCallbackLogin(
    refresh,
    canPost ? provider.buildRequest(params.code, params.state) : null,
  );
  const sessionActive = hasSession(authStatus);
  const returnLabel = sessionActive ? RETURN_LABEL : LOGIN_LABEL;
  // Отмена у провайдера при входе из Daychi (ADR-0181) — сразу назад в
  // приложение с отказом, тупик ему не нужен.
  const leavingToNative = useNativeProviderCancel(cancelled);

  if (leavingToNative) return <NativeLeavingStatus />;

  if (cancelled || params === null) {
    return (
      <TitledDeadEnd
        title={cancelled ? CANCELLED_TITLE : INCOMPLETE_LINK_TITLE}
        message={cancelled ? provider.cancelledMessage : provider.incompleteLinkMessage}
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
