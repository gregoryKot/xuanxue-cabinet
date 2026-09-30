// Адреса экранов уведомлений — по одной константе на маршрут (routeModules.ts),
// доступ (screenAccess.ts) и все ссылки на них: «Профиль», лента и подсказка
// про push на экране установки (CLAUDE.md «Без магических строк»).
/** Лента событий и новых заданий (ADR-0063). */
export const NOTIFICATIONS_SCREEN_PATH = '/notifications';
/** «Настройки уведомлений» (ADR-0162) — подэкран ленты: в адресе она родитель,
 * и «Назад» с экрана ведёт в неё. Входов два — «Профиль» и сама лента. */
export const NOTIFICATION_SETTINGS_PATH = `${NOTIFICATIONS_SCREEN_PATH}/settings`;
