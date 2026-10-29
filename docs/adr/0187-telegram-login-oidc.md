# 0187. Вход через Telegram по OpenID Connect: code + PKCE вместо перехода с `#tgAuthResult`

Дата: 2026-10-26. Статус: принято. Дополняет [0028](0028-telegram-login-redirect-everywhere.md): тот же способ входа, другой протокол. Устройство потока — как у Google, [0145](0145-google-login-and-linking-by-email.md).

## Контекст

Владелец, 2026-10-22, стейджинг: «при входе через телегу просто закрывается
страница и ничего не логинится. по ссылке для регистрации заходят, а после
логаута не могут». Кабинет уводил вкладку на `oauth.telegram.org/auth?bot_id=…&origin=…&request_access=write&return_to=…`
и ждал возврата с `#tgAuthResult=` (ADR-0028). Теперь уже вошедшему в Telegram
страница после подтверждения закрывается сама и никуда не возвращает; кому
Telegram показывает номер и регистрацию — доходит. Независимое описание того же
поведения: [YunaBotDeveloper/sub2api#64](https://github.com/YunaBotDeveloper/sub2api/pull/64),
2026-10-02, «Telegram's auth page closes itself after confirmation when opened
as a full-page redirect». Документация Telegram
([core.telegram.org/bots/telegram-login](https://core.telegram.org/bots/telegram-login))
теперь описывает вход по OpenID Connect (Authorization Code + PKCE), а прежний
виджет перенесла в архив: старый путь не чинится на нашей стороне, он снят с
поддержки на их.

Ограничения те же: без паролей и без сторонних библиотек проверки токенов
(ADR-0012), регистрация только по ссылке-приглашению (ADR-0030/0036), ключ входа
— `users.telegramId`, существующих людей терять нельзя.

## Решение

**Поток** — как у Google (ADR-0145). `GET /api/auth/telegram/oidc/start?join=<код>`
ставит httpOnly cookie `telegram_oauth` (`state`, `code_verifier`, код
приглашения; `Path=/api/auth/telegram/oidc`, 10 минут, `SameSite=Lax`) и отвечает
302 на `oauth.telegram.org/auth` с `client_id` (числовой id бота),
`redirect_uri=${PUBLIC_URL}/login/telegram`, `response_type=code`,
`scope=openid profile telegram:bot_access`, `state`, `code_challenge` (S256),
`origin` (схема и хост из `PUBLIC_URL`, без пути): документация Telegram про него
в адресной форме молчит, но без него сервер отвечает `200` с текстом
`origin required` вместо страницы входа (проверено вживую 2026-10-29).
`telegram:bot_access` — прежний `request_access=write`: бот может писать человеку.
`phone` не просим — телефон кабинету не нужен. Telegram возвращает вкладку на
`/login/telegram?code=…&state=…`, страница шлёт пару `POST /api/auth/telegram/oidc`
под тем же CSRF-заголовком. Сервер гасит cookie заявки сразу, сверяет `state`
(`timingSafeEqual`), меняет код на `id_token` у `oauth.telegram.org/token`
(`Authorization: Basic base64(client_id:client_secret)`, тело —
`grant_type`, `code`, `redirect_uri`, `client_id`, `code_verifier`), проверяет
`iss`, `aud`, `exp` и выпускает ту же сессию (`AuthService.issueSession`).

**Ключ входа — claim `id`**, числовой Telegram ID, тот же, что был в виджете и
лежит в `users.telegramId`: люди, уже сидящие в кабинете, узнаются как есть.
`sub` у Telegram непрозрачный и с Telegram ID не связан — по нему никого не найти
и не подделать чужой аккаунт. Имя для нового человека — `given_name` и
`family_name`, иначе `name`, иначе `preferred_username`, иначе заглушка
`NEW_PERSON_NAME` (экран первого входа спросит имя). Поиск, создание и
приглашение — прежний `LoginIdentityService.resolveTelegramUser`.

**Подпись `id_token` не проверяем** — по тем же основаниям, что у Google:
токен пришёл напрямую от token endpoint по TLS в обмен на `client_secret` и
`code_verifier`; OIDC Core §3.1.3.7 п.6 разрешает опереться на TLS вместо
подписи. `nonce` не шлём: в документации Telegram для запроса по адресу его нет,
а для Authorization Code Flow он необязателен (OIDC Core §3.1.2.1); подмену ответа
закрывают `state` из cookie и PKCE.

**Expand → contract.** Новая переменная `TELEGRAM_LOGIN_CLIENT_SECRET`
необязательна. Пока её нет, `GET /auth/config` отдаёт `telegramOidcEnabled: false`,
кнопка ведёт по прежнему пути (`POST /auth/telegram`, `useTelegramAuthResultLogin`,
`redirectToTelegramAuth`), а `…/oidc/start` отвечает 503: деплой без настройки
BotFather не отключает Telegram-вход совсем. Прежний путь целиком (эндпоинт,
проверка подписи, страница, тексты, тесты, ADR-0028 в части механики) удаляется
отдельным PR, когда и стейджинг, и прод идут по OIDC (CLAUDE.md, правило 6).

## Альтернативы

- JS-библиотека Telegram во всплывающем окне — сторонний скрипт в CSP и COOP
  `same-origin-allow-popups`; попапы уже подводили (ADR-0020, ADR-0028).
- Оставить переход с `#tgAuthResult` и ждать — вход сломан у всех, кто уже
  вошёл в Telegram, а срока у Telegram нет.
- Код, присланный ботом в личку, — вход «через бота» требует от человека второго
  приложения и личного чата, которого у нового ученика ещё нет (ADR-0027).
- Проверка подписи `id_token` по JWKS Telegram — лишний сетевой вызов и кеш
  ключей без выигрыша при обмене кода на сервере (довод ADR-0145).
- `openid-client` / Passport — зависимость ради ста строк кода.

## Последствия

- Владельцу — настройка на каждое окружение, пока она не сделана, остаётся
  прежний вход (RUNBOOK §5): BotFather → бот → «Login Widget» → «Allowed URLs»:
  origin `https://staging.xuanxue.su` и redirect URI
  `https://staging.xuanxue.su/login/telegram` (прод: `https://xuanxue.su` и
  `https://xuanxue.su/login/telegram`, на боте прода); Client Secret — в Railway
  `TELEGRAM_LOGIN_CLIENT_SECRET` этого окружения. Адрес в «Allowed URLs» должен
  совпасть с `redirect_uri` буква в букву.
- Это внешнее изменение, а граница с Telegram в CI не воспроизводится
  (token endpoint подменён фейком), поэтому механизм «что не даст повториться»
  (CLAUDE.md, правило 1д) здесь — ручная проверка после каждого выката и
  включения: **войти, выйти, войти снова** с аккаунтом, который уже в кабинете
  (случай, на котором сломался прежний вход), и один раз по ссылке-приглашению.
  На стейджинге заодно убедиться, что `id` совпадает с `telegramId` существующего
  аккаунта: человека узнаёт, а не отвечает «нужна ссылка-приглашение» (403).
  Шаги — RUNBOOK §5. Серверная часть повтора входа покрыта e2e
  `telegram-oidc.e2e-spec.ts` («войти, выйти, войти снова»).
- `code`/`state` на `/login/telegram` вырезаются из логов теми же правилами, что
  у Google (`request-serializer.ts`, `redact-paths.ts`); `Location` старта и
  `Set-Cookie` не логируются.
- Cookie `telegram_oauth` и её `Path` отдельные от `google_oauth`; прежний
  `POST /auth/telegram` её не видит.
- Гейты: `telegram-oidc-id-token.spec.ts` (каждая ветка проверки), юнит-спеки
  конфигурации, адреса, cookie, клиента токена и сервиса, e2e
  `telegram-oidc.e2e-spec.ts` (CSRF, state, приглашение, блокировка, повтор тела),
  `check-ownership-e2e.mjs`, `check-env-example.mjs`, храповики файлов и
  копипасты (общие `oauth-state-cookie.ts`, `oauth-token-request.ts`,
  `jwt-payload.ts` с Google).
