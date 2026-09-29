// Вход через Google (ADR-0005, ADR-0145, SECURITY §2) — общий контракт api и
// web (CLAUDE.md «Слои»). Поток — authorization code + PKCE: кнопка ведёт на
// `GET /api/auth/google/start`, сервер ставит httpOnly cookie с `state`,
// `code_verifier` и `nonce` и отправляет вкладку в Google; Google возвращает
// её на страницу `/login/google?code=…&state=…`, а та шлёт пару POST-ом —
// под тем же CSRF-заголовком, что остальные входы.

/** Адрес, с которого начинается вход: браузер переходит на него целой
 * вкладкой (не `apiFetch`) — ответ сервера 302 в Google. Ссылка-приглашение
 * едет query-параметром `join` (`INVITE_QUERY_PARAM`), как у Telegram. */
export const GOOGLE_LOGIN_START_PATH = '/api/auth/google/start';

/** Query-параметр начала потока: `intent=link` — привязать Google к уже
 * вошедшему человеку («Профиль»), а не войти. Намерение сервер кладёт в ту же
 * cookie, что `state`, вместе с id сессии: страница возврата одна на оба
 * случая, а решает сервер, не адрес. */
export const GOOGLE_INTENT_QUERY_PARAM = 'intent';
export const GOOGLE_LINK_INTENT = 'link';

/** Путь страницы, на которую Google возвращает вкладку, — он же хвост
 * `redirect_uri` (`${PUBLIC_URL}${GOOGLE_LOGIN_CALLBACK_PATH}`). Одна строка на
 * api и web: разойдись они, Google ответил бы `redirect_uri_mismatch`. */
export const GOOGLE_LOGIN_CALLBACK_PATH = '/login/google';

/** Тело `POST /auth/google` (`@Public()`): что Google вернул в адресе. */
export interface GoogleLoginInput {
  code: string;
  state: string;
}

/** `state` — `randomBytes(32)` в base64url без выравнивания, 43 знака. Проверяется
 * и в DTO, и на странице возврата — чтобы не звать сервер с обрезанным адресом. */
export const GOOGLE_OAUTH_STATE_RE = /^[A-Za-z0-9_-]{43}$/;

/** Код авторизации Google — непрозрачная строка; формат Google не обещает,
 * поэтому только разумный потолок длины и печатные знаки без пробелов. */
export const GOOGLE_OAUTH_CODE_RE = /^[\x21-\x7e]{10,512}$/;

export const GOOGLE_LOGIN_NOT_AVAILABLE_MESSAGE =
  'Вход через Google пока не подключён. Войдите через Telegram или по почте.';

/** Один текст на «cookie нет», «state не совпал», «Google не отдал токен»,
 * «токен не прошёл проверку» (SECURITY §2): причина постороннему не нужна,
 * а человеку помогает одно и то же — начать заново. */
export const GOOGLE_LOGIN_FAILED_MESSAGE =
  'Не получилось войти через Google. Нажмите «Войти через Google» ещё раз.';

/** Адрес Google совпал с адресом в кабинете, но Google за этот адрес не
 * ручается (не Gmail и не Google Workspace, ADR-0145): связать сами не
 * можем, иначе чужой ящик, когда-то подтверждённый в Google, открыл бы
 * аккаунт. Человек входит по почте — как входил и раньше. */
export const GOOGLE_EMAIL_NEEDS_EMAIL_LOGIN_MESSAGE =
  'Этот адрес уже есть в кабинете. Войдите по почте и привяжите Google в профиле.';

/** К аккаунту с этим адресом уже привязан другой Google. Перезаписать ключ
 * входа молча нельзя — тот же довод, что у занятого Telegram (ADR-0034). */
export const GOOGLE_OTHER_ACCOUNT_MESSAGE =
  'К этому аккаунту уже привязан другой Google. Войдите через него или по почте.';

/** Привязка: этот Google — уже ключ входа другого аккаунта. Не слияние
 * (ADR-0034): записи объединяет админ. */
export const GOOGLE_LINK_TAKEN_MESSAGE =
  'Этот Google уже привязан к другому аккаунту кабинета. Напишите учителю школы.';

/** Привязка: к вашему аккаунту уже привязан другой Google. */
export const GOOGLE_LINK_OTHER_MESSAGE =
  'К вашему аккаунту уже привязан другой Google. Напишите учителю школы.';

/** Привязка начата из одной сессии, а вернулась в другую (или сессии нет). */
export const GOOGLE_LINK_SESSION_MESSAGE =
  'Сессия закончилась. Войдите и нажмите «Привязать Google» ещё раз.';
