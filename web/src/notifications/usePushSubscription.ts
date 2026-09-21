// Подписка на push браузера (ADR-0092, ПР №5, последний из «Порядка работ»)
// — логика вынесена из PushNotificationsSection.tsx (CLAUDE.md «Логика вне
// компонентов»). Мутации своего хука — не в api/apiPaths.ts: там только
// GET-пути, общие с предзагрузкой экрана (см. шапку apiPaths.ts), тем же
// приёмом, что NO_TELEGRAM_PATH в telegram/useNoTelegram.ts.
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PushPublicKeyDto,
  PushSubscriptionDto,
  SubscribePushInput,
} from '@xuanxue/shared';
import { ApiError, apiFetch } from '../api/http';
import {
  PUSH_DISABLE_ERROR_MESSAGE,
  PUSH_ENABLE_ERROR_MESSAGE,
  PUSH_LOAD_ERROR_MESSAGE,
} from './pushNotificationsCopy';
import { arrayBufferToBase64Url, base64UrlToUint8Array } from './pushSubscriptionCodec';
import { resolvePushSectionState, type PushSectionState } from './pushSectionState';

const PUSH_PUBLIC_KEY_PATH = '/push/public-key';
const PUSH_SUBSCRIPTIONS_PATH = '/me/push-subscriptions';

export interface UsePushSubscriptionResult {
  /** Идёт первичное определение состояния (ключ сервера + окружение браузера). */
  loading: boolean;
  /** Не удалось получить `GET /push/public-key` — сеть, не «push выключен». */
  loadError: string | null;
  reload: () => Promise<void>;
  /** `null`, пока loading/loadError; иначе — одно из состояний ТЗ п.2. */
  state: PushSectionState | null;
  /** Идёт enable()/disable() — кнопка «занята» (Button.pending). */
  pending: boolean;
  actionError: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

export function usePushSubscription(): UsePushSubscriptionResult {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<PushSectionState | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Ключ сервера нужен только внутри enable() (applicationServerKey) — не
  // часть состояния экрана, перерисовку по нему заказывать незачем. Тип
  // `string`, не `string | null`: enable() читает ref, только когда state.kind
  // — 'default'/'not-subscribed', а resolvePushSectionState отдаёт их
  // исключительно при непустом publicKey (см. ниже) — пустая строка сюда
  // никогда не доходит до реального чтения, `!`/`as` для сужения типа не
  // нужны (CLAUDE.md «TypeScript строгий»: чини типы, не глуши линт).
  const publicKeyRef = useRef<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { publicKey } = await apiFetch<PushPublicKeyDto>(PUSH_PUBLIC_KEY_PATH);
      if (publicKey !== null) publicKeyRef.current = publicKey;
      setState(await resolvePushSectionState(publicKey));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : PUSH_LOAD_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enable = useCallback(async () => {
    // Кнопка включения видна только в этих двух состояниях
    // (PushNotificationsSection.tsx) — защита от вызова из чужого места.
    if (!state || (state.kind !== 'default' && state.kind !== 'not-subscribed')) return;
    const publicKey = publicKeyRef.current;
    setPending(true);
    setActionError(null);
    try {
      if (state.kind === 'default') {
        const permission = await Notification.requestPermission();
        if (permission === 'denied') {
          setState({ kind: 'denied' });
          return;
        }
        // 'default' — диалог закрыли без ответа: кнопка остаётся как была,
        // на сервер ничего не уходит (ТЗ ПР №5).
        if (permission === 'default') return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey),
      });
      const p256dhKey = subscription.getKey('p256dh');
      const authKey = subscription.getKey('auth');
      if (!p256dhKey || !authKey) throw new Error(PUSH_ENABLE_ERROR_MESSAGE);

      const body: SubscribePushInput = {
        endpoint: subscription.endpoint,
        p256dh: arrayBufferToBase64Url(p256dhKey),
        auth: arrayBufferToBase64Url(authKey),
      };
      await apiFetch<PushSubscriptionDto>(PUSH_SUBSCRIPTIONS_PATH, {
        method: 'POST',
        body,
      });
      setState({ kind: 'subscribed' });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : PUSH_ENABLE_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }, [state]);

  const disable = useCallback(async () => {
    if (!state || state.kind !== 'subscribed') return;
    setPending(true);
    setActionError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      // Отписка в браузере и снятие записи на сервере — оба вызова, одно без
      // другого оставляет мусор (ТЗ ПР №5). Подписки уже нет локально (редкий
      // случай, рассинхрон) — сервер тоже нечего снимать по известному
      // endpoint, дальше просто фиксируем итог.
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await apiFetch<void>(PUSH_SUBSCRIPTIONS_PATH, {
          method: 'DELETE',
          body: { endpoint },
        });
      }
      setState({ kind: 'not-subscribed' });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : PUSH_DISABLE_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }, [state]);

  return {
    loading,
    loadError,
    reload: load,
    state,
    pending,
    actionError,
    enable,
    disable,
  };
}
