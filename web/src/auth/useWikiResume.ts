// Логика экрана `/wiki` (ADR-0183). Адрес `/wiki?returnTo=…` отвечает сервер:
// ставит cookie и переходит на wiki. После входа кабинет ведёт человека по
// адресу из postLoginPath() переходом внутри приложения, и для `/wiki?…` такой
// переход сервера не достигает — экран нужен затем, чтобы заменить его полной
// загрузкой страницы.
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { redirectCurrentTab } from './telegramAuthRedirect';

/** Ключ первой записи истории: роутер ставит его адресу, на котором
 * страница открылась, — переходы внутри приложения получают случайный. */
const FIRST_ENTRY_KEY = 'default';

/** redirecting — вкладка уходит на сервер; unavailable — приложение само
 * открылось на этом адресе, и сервер его не обработал. */
export type WikiResumeView = 'redirecting' | 'unavailable';

export function useWikiResume(): WikiResumeView {
  const { key, pathname, search } = useLocation();
  // Страница открылась сразу на `/wiki`: значит, этот адрес отдал не сервер
  // входа, а раздача приложения (dev-сервер, сбой маршрута). Полная загрузка
  // привела бы сюда же и крутилась бы без конца.
  const openedHere = key === FIRST_ENTRY_KEY;
  const leftRef = useRef(false);

  useEffect(() => {
    if (openedHere || leftRef.current) return;
    leftRef.current = true;
    redirectCurrentTab(`${pathname}${search}`);
  }, [openedHere, pathname, search]);

  return openedHere ? 'unavailable' : 'redirecting';
}
