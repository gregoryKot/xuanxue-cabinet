// Вход через Telegram на телефоне — переходом всей вкладки, а не попапом.
//
// `window.Telegram.Login.auth()` всегда делает `window.open`, а на сенсорном
// экране это отдельная вкладка: браузер уводит туда, вход завершается в ней,
// а исходная вкладка остаётся с кнопкой «Войти через Telegram». Если попап
// заблокирован — не происходит вообще ничего, виджет в этом случае даже не
// вешает обработчик. Отзыв владельца 2026-09-10: «с телефона так и кидает на
// главную страницу после авторизации», до этого — «зависает на странице
// входа» (PR #60 закрыл только возврат, не сам переход).
//
// Переход в той же вкладке убирает обе беды: Telegram возвращает браузер на
// `return_to` с фрагментом `#tgAuthResult=`, и его дочитывает уже существующий
// useTelegramAuthResultLogin. Адрес собираем тот же, что собирает сам виджет
// (telegram-widget.js, Telegram.Login._auth) — это его же публичная точка
// входа, не наш собственный протокол. ADR-0020.
const TELEGRAM_AUTH_URL = 'https://oauth.telegram.org/auth';

/** Попап ненадёжен там, где основной ввод — палец: браузер открывает его
 * отдельной вкладкой или молча блокирует. `pointer: coarse` — про способ
 * ввода, а не про ширину экрана, поэтому планшет и телефон в альбомной
 * ориентации сюда тоже попадают, а узкое окно на десктопе — нет. */
export function usesRedirectFlow(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

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
