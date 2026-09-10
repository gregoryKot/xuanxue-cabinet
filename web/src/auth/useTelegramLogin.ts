// Вход через Telegram под нашей CSP (docs/RUNBOOK.md §5): виджет
// `data-onauth="fn(user)"` исполняет строку через `eval` внутри
// telegram-widget.js — наша CSP `script-src` без `'unsafe-eval'` это
// заблокирует. Используем задокументированный Telegram способ «своя кнопка»:
// `window.Telegram.Login.auth(options, callback)` — callback настоящая
// функция, eval не участвует, попап открывается на oauth.telegram.org (CSP
// уже разрешает frameSrc/connectSrc для него).
import { useCallback, useEffect, useState } from 'react';
import type { TelegramLoginInput } from '@xuanxue/shared';
import { redirectToTelegramAuth, usesRedirectFlow } from './telegramAuthRedirect';

const WIDGET_SRC = 'https://telegram.org/js/telegram-widget.js?22';

interface TelegramLoginAuthOptions {
  bot_id: number;
  request_access?: 'write';
}

type TelegramGlobal = {
  Login: {
    auth: (
      options: TelegramLoginAuthOptions,
      callback: (user: TelegramLoginInput | false) => void,
    ) => void;
  };
};

declare global {
  interface Window {
    Telegram?: TelegramGlobal;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadWidgetScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = WIDGET_SRC;
    script.async = true;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () =>
      reject(new Error('Не удалось загрузить виджет Telegram')),
    );
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Только для тестов — module-level кеш скрипта иначе переживает файлы. */
export function __resetTelegramWidgetForTests(): void {
  scriptPromise = null;
}

/** Чем закончилась попытка входа. Три исхода вместо «пользователь или null»:
 * «ушли на Telegram» и «вход не подтвердился» выглядят на экране по-разному —
 * в первом случае ждём возврата, во втором человеку надо сказать, что вход не
 * состоялся, иначе окно Telegram закрывается и не происходит ничего (отзыв
 * владельца 2026-09-10, CLAUDE.md «Логи»: тихий отказ — самая дорогая ошибка). */
// Не экспортируем: тип живёт внутри контракта хука, отдельного имени наружу
// не нужно (knip ловит экспорт, которым никто не пользуется).
type TelegramLoginOutcome =
  | { kind: 'user'; user: TelegramLoginInput }
  | { kind: 'redirected' }
  | { kind: 'cancelled' };

export interface UseTelegramLoginResult {
  ready: boolean;
  login: () => Promise<TelegramLoginOutcome>;
}

export function useTelegramLogin(botId: number | undefined): UseTelegramLoginResult {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!botId) return;
    // На телефоне вход идёт переходом, виджет там не нужен вовсе — кнопка
    // готова сразу, лишнего запроса к telegram.org нет.
    if (usesRedirectFlow()) {
      setReady(true);
      return;
    }
    let cancelled = false;
    loadWidgetScript()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [botId]);

  const login = useCallback((): Promise<TelegramLoginOutcome> => {
    if (botId && usesRedirectFlow()) {
      redirectToTelegramAuth(botId);
      return Promise.resolve({ kind: 'redirected' });
    }
    return new Promise((resolve, reject) => {
      if (!botId || !window.Telegram) {
        reject(
          new Error('Виджет Telegram ещё не загрузился. Подождите и попробуйте снова.'),
        );
        return;
      }
      window.Telegram.Login.auth({ bot_id: botId, request_access: 'write' }, (user) => {
        // false — попап закрылся, а вход не подтвердился: человек закрыл окно
        // сам, либо браузер не отдал виджету cookie oauth.telegram.org
        // (Safari режет третьесторонние) и его дозапрос вернул пустоту.
        resolve(user ? { kind: 'user', user } : { kind: 'cancelled' });
      });
    });
  }, [botId]);

  return { ready, login };
}
