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

export interface UseTelegramLoginResult {
  ready: boolean;
  /** Данные входа — когда вход прошёл попапом (десктоп). `null` — когда
   * входить нечем: попап закрыли без входа или мы увели вкладку на Telegram
   * (телефон, telegramAuthRedirect.ts) и результат придёт фрагментом
   * `#tgAuthResult=` уже на возврате. Оба случая — не ошибка. */
  login: () => Promise<TelegramLoginInput | null>;
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

  const login = useCallback((): Promise<TelegramLoginInput | null> => {
    if (botId && usesRedirectFlow()) {
      redirectToTelegramAuth(botId);
      return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
      if (!botId || !window.Telegram) {
        reject(
          new Error('Виджет Telegram ещё не загрузился. Подождите и попробуйте снова.'),
        );
        return;
      }
      window.Telegram.Login.auth({ bot_id: botId, request_access: 'write' }, (user) => {
        resolve(user || null); // false — пользователь закрыл попап без входа
      });
    });
  }, [botId]);

  return { ready, login };
}
