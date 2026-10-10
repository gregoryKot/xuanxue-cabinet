// Логика экрана `/login/native` (ADR-0181, «Браузер»): номер попытки из
// адреса — в ключ вкладки, сессия есть — полный переход на `continue`, отказ
// — тот же переход с отменой. Здесь же уход с отменой после отказа у
// провайдера входа (useNativeProviderCancel, страница возврата Google). Номер берётся только из адреса: адрес выбирает
// попытку, а ключ вкладки нужен лишь затем, чтобы вход вернул сюда же
// (postLoginPath). Без номера в адресе продолжать нечего — ни «последней»
// попытки, ни попытки из хранилища.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NATIVE_ATTEMPT_PARAM } from '@xuanxue/shared';
import { hasSession, useAuth } from './AuthProvider';
import {
  consumeNativeAttempt,
  isNativeAttemptId,
  nativeContinueUrl,
  peekNativeAttempt,
  saveNativeAttempt,
} from './nativeAttempt';
import { redirectCurrentTab } from './telegramAuthRedirect';

/** invalid — в адресе нет годного номера; leaving — вкладка уже уходит на
 * `continue`; login — гость, показываем способы входа. */
type NativeLoginView = 'invalid' | 'leaving' | 'login';

export interface UseNativeLoginResult {
  view: NativeLoginView;
  /** «Вернуться в приложение»: Daychi получит `access_denied` без кода. */
  returnToApp: () => void;
}

interface LeaveNativeAttempt {
  /** Снять ключ вкладки и уйти на `continue`; `cancel` — Daychi получит
   * `access_denied`. Второй и следующие вызовы ничего не делают. */
  leave: (id: string, cancel: boolean) => void;
  hasLeft: () => boolean;
}

/** Один уход на `continue` за жизнь экрана — и при двойном эффекте
 * StrictMode, и когда сессия появляется сразу после клика «Вернуться»:
 * переход в Daychi по его схеме адреса страницу не выгружает, а второй
 * `continue` той же попытки сервер встретил бы уже завершённой. */
function useLeaveNativeAttempt(): LeaveNativeAttempt {
  const leftRef = useRef(false);
  const leave = useCallback((id: string, cancel: boolean) => {
    if (leftRef.current) return;
    leftRef.current = true;
    consumeNativeAttempt();
    redirectCurrentTab(nativeContinueUrl(id, { cancel }));
  }, []);
  const hasLeft = useCallback(() => leftRef.current, []);
  return { leave, hasLeft };
}

/** Отмена у провайдера входа (Google вернул `error`) при попытке Daychi в
 * этой вкладке — сразу `continue` с отменой, без тупика «Вход не завершён»:
 * Daychi ждёт `access_denied`. Номер читается один раз при открытии
 * страницы — после ухода ключа уже нет, а тупик под уходящей вкладкой не
 * нужен. `true` — вкладка уходит в Daychi. */
export function useNativeProviderCancel(providerCancelled: boolean): boolean {
  const [attemptId] = useState(() => (providerCancelled ? peekNativeAttempt() : null));
  const { leave } = useLeaveNativeAttempt();
  useEffect(() => {
    if (attemptId !== null) leave(attemptId, true);
  }, [attemptId, leave]);
  return attemptId !== null;
}

export function useNativeLogin(): UseNativeLoginResult {
  const [searchParams] = useSearchParams();
  const attemptParam = searchParams.get(NATIVE_ATTEMPT_PARAM);
  const attemptId = isNativeAttemptId(attemptParam) ? attemptParam : null;
  const { status, refresh } = useAuth();
  const sessionActive = hasSession(status);
  const [cancelled, setCancelled] = useState(false);
  const { leave, hasLeft } = useLeaveNativeAttempt();

  // hasSession, не status === 'ok': заблокированный тоже уходит на
  // `continue`, сервер сам ответит Daychi `access_denied`. После ухода ключ
  // заново не кладётся — иначе следующий вход в этой вкладке повёл бы на
  // уже завершённую попытку.
  useEffect(() => {
    if (attemptId === null || hasLeft()) return;
    saveNativeAttempt(attemptId);
    if (sessionActive) leave(attemptId, false);
  }, [attemptId, sessionActive, leave, hasLeft]);

  // Вход по ссылке из письма завершается в другой вкладке: эта узнаёт о
  // сессии, только перечитав /auth/me, когда человек к ней вернётся.
  const watchSession = attemptId !== null && !sessionActive && status !== 'loading';
  useEffect(() => {
    if (!watchSession) return;
    function handleReturn(): void {
      if (document.visibilityState === 'visible') void refresh();
    }
    window.addEventListener('focus', handleReturn);
    document.addEventListener('visibilitychange', handleReturn);
    return () => {
      window.removeEventListener('focus', handleReturn);
      document.removeEventListener('visibilitychange', handleReturn);
    };
  }, [watchSession, refresh]);

  const returnToApp = useCallback(() => {
    if (attemptId === null) return;
    setCancelled(true);
    leave(attemptId, true);
  }, [attemptId, leave]);

  let view: NativeLoginView = 'login';
  if (attemptId === null) view = 'invalid';
  else if (sessionActive || cancelled) view = 'leaving';
  return { view, returnToApp };
}
