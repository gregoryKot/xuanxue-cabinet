// Вход через Telegram — единственный путь, на любом устройстве: переход
// текущей вкладки на oauth.telegram.org, без попапа.
//
// Раньше попап (`window.Telegram.Login.auth()`, `window.open`) оставался на
// десктопе — так и не работал там для владельца 2026-09-15: блокировка
// попапов и третьесторонние cookie oauth.telegram.org ненадёжны в браузере
// не только на телефоне (ADR-0020 те же причины считал только мобильными).
// На сенсорном экране `window.open` тем более уводил в отдельную вкладку,
// откуда результат не возвращался никаким `postMessage`: браузер уводил
// туда, вход завершался в ней, а исходная вкладка оставалась с кнопкой
// «Войти через Telegram» — отзыв владельца 2026-09-10.
//
// Переход в той же вкладке убирает обе беды: Telegram возвращает браузер на
// `return_to` с фрагментом `#tgAuthResult=`, и его дочитывает уже существующий
// useTelegramAuthResultLogin. Адрес собираем тот же, что собирал виджет
// (telegram-widget.js, Telegram.Login._auth) — это публичная точка входа
// Telegram, не наш собственный протокол. ADR-0028 (заменяет попап из
// ADR-0020 на десктопе).
const TELEGRAM_AUTH_URL = 'https://oauth.telegram.org/auth';

export function telegramAuthUrl(botId: number, origin: string, returnTo: string): string {
  const params = new URLSearchParams({
    bot_id: String(botId),
    origin,
    request_access: 'write',
    return_to: returnTo,
  });
  return `${TELEGRAM_AUTH_URL}?${params.toString()}`;
}

export function redirectToTelegramAuth(botId: number): void {
  const url = telegramAuthUrl(botId, window.location.origin, window.location.href);
  window.location.assign(url);
}
