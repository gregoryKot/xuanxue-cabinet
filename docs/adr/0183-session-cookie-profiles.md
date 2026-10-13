# 0183. Профили cookie сессии: общая с wiki, свой стейджинг, повтор — отказ

Дата: 2026-10-13. Статус: принято.

## Контекст

Wiki (`wiki.xuanxue.su`, проект Daychi) читается по сессии кабинета: браузер несёт ей ту же
cookie, Daychi проверяет её у кабинета на каждый запрос. Всё видимое снаружи задаёт контракт
Workshop [web-wiki-session](https://github.com/dveyarangi/xuanxue-workshop/blob/25def59e25fc847764cc43de8d963bf62a16512e/docs/contracts/web-wiki-session.md)
(ревизия `25def59`, Workshop issue #12): имя, домен и атрибуты cookie по окружению, уборка
прежней host-only cookie, отказ при двух одноимённых значениях. Cookie прода с
`Domain=xuanxue.su` браузер присылает и на `staging.xuanxue.su`, а у стейджинга свой секрет и
своя база. Прод и стейджинг оба запускаются с `NODE_ENV=production`.

## Решение

**Профиль — env `DEPLOY_PROFILE`:** `production`, `staging`, `local` (по умолчанию). Значения
зашиты таблицей в `auth/session-cookie.ts`, ровно по контракту:

| Профиль      | Имя               | Domain               | Secure | Гасит host-only `session` |
| ------------ | ----------------- | -------------------- | ------ | ------------------------- |
| `production` | `session`         | `xuanxue.su`         | да     | да                        |
| `staging`    | `session_staging` | `staging.xuanxue.su` | да     | да                        |
| `local`      | `session`         | —                    | нет    | нет                       |

В `NODE_ENV=production` профиль обязателен и не `local` — валидатор env не даёт подняться.

**Выпуск.** Вход (Telegram, email-ссылка и код, Google), rolling-продление в гварде и выход
отдают поля `Set-Cookie` массивом: сначала `session=; Path=/; Max-Age=0` без `Domain` — гасит
прежнюю host-only cookie этого адреса, — потом действующая cookie профиля. На стейджинге это
поле без `Domain` не задевает cookie прода. Узел выпуска один — `AuthService.issueSession` и
`logoutCookies`.

**Чтение.** Сессию читает только `AuthService.verifyCookieHeader`: cookie имени профиля, и только
если она одна. Две одноимённые — 401 и бакет троттлера по IP, а не выбор первой: по заголовку
`Cookie:` не видно, какая свежее. Гвард, троттлер, предикаты сырых загрузок и `findSessionUser`
получают `AuthService`, а не секрет — правило одно на все пути. Прежняя host-only `session`
прода читается как обычная: у неё то же имя, и вход заново не нужен.

## Альтернативы

- Брать профиль из `PUBLIC_URL`: правка адреса молча меняла бы cookie.
- Три env (имя, домен, адрес wiki): значения фиксирует контракт, три переменные — три места
  ошибиться.
- Выбирать среди повторов ту, что прошла подпись: контракт запрещает выбор, а двух валидных
  сессий разных людей подпись не различит.
- Перенести стейджинг на отдельный домен: контракт оставляет `staging.xuanxue.su`.

## Последствия

- Выкат: до мержа — `DEPLOY_PROFILE=staging` в Railway стейджинга, до релиза — `production` в
  проде (RUNBOOK §2.1, §2.4). На стейджинге все входят заново: имя cookie сменилось.
- Повтор возможен, если старый инстанс при деплое или после отката выдаст host-only cookie
  рядом с общей. Человек получает 401, вход гасит host-only — повтор уходит сам.
- Cookie прода на стейджинге не читается, не продлевается и не стирается; в логи cookie не
  попадает целиком (`logging/redact-paths.ts`).
- Гейты: `session-cookie.spec.ts` (таблица, поля, строгое чтение), `auth.service.spec.ts`,
  `env.validate.spec.ts`, e2e `session-profile-production` и `session-profile-staging` на
  настоящем `AppModule` — вход, продление, выход, повтор, чужая cookie.
