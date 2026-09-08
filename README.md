# Xuanxue Cabinet

Кабинет школы тайцзицюань «Сюань-Сюэ» (玄学): расписание, автоматические рассылки
ссылок и записей, оплаты, материалы, экзамены. Для учителей, администратора и учеников.
Устанавливается на телефон как приложение (PWA) и присылает уведомления.
Продакшен — [xuanxue.su](https://xuanxue.su).

- План проекта и этапы: [docs/PLAN.md](docs/PLAN.md)
- Правила разработки: [CLAUDE.md](CLAUDE.md)
- Голос продукта: [docs/VOICE.md](docs/VOICE.md)
- Безопасность: [docs/SECURITY.md](docs/SECURITY.md)
- Эксплуатация и инциденты: [docs/RUNBOOK.md](docs/RUNBOOK.md)
- Архитектурные решения: [docs/adr/](docs/adr/README.md)

## Стек

NestJS + Mongoose, React + Vite (PWA), MongoDB Atlas, Railway. Один сервис: API раздаёт
статику фронта, принимает вебхук Telegram-бота и крутит планировщик рассылок.
Бэкап базы — раз в сутки зашифрованным дампом в GitHub Actions (RUNBOOK §7).

## Структура

```
api/        NestJS: api/src/<домен>/ — module, service, controller, dto, schema, spec
web/        React SPA
shared/     типы контрактов API, константы, чистые утилиты для api и web
docs/       план, стиль-гайд, безопасность, runbook, ADR
scripts/    CI-храповики и их бейслайны
```

## Локальный запуск

```bash
nvm use                   # Node из .nvmrc
npm ci
cp .env.example api/.env  # npm run --workspace=api стартует с cwd внутри api/, .env — тоже там
npm run dev               # api на :3000, web на :5173
```

Реальные ссылки Zoom для первого импорта лежат в `api/seed/classes.local.json`,
файл в `.gitignore`. Формат — `api/seed/classes.example.json`. Импорт:

```bash
npm run seed:classes --workspace=api -- api/seed/classes.local.json
```

Команда идемпотентна: класс, у которого уже есть точное совпадение названия
и подписи группы, пропускается, а не дублируется — перезапускать безопасно.

Вход через Telegram (`window.Telegram.Login.auth()`, `POST /auth/telegram`) локально
не проверить: попап на `oauth.telegram.org` работает только с доменом, привязанным к
боту в BotFather (`/setdomain`) — у `localhost` такого домена нет. `BOT_TOKEN` — тот же,
что у вебхука бота (`.env.example`); отдельная переменная для виджета не нужна,
`GET /auth/config` сам достаёт числовой id бота из `BOT_TOKEN`. `/start` в боте
регистрирует чат как канал рассылки (docs/PLAN.md §6, «Каналы»), но сессию кабинета не
выдаёт. Локальный вход — только ручная подмена cookie, см. `api/test/e2e-support/session.ts`,
как её делают тесты.

## Перед PR

```bash
npm run check             # tsc, eslint, prettier, тесты, все храповики — то же, что CI
```

Заголовок PR — по Conventional Commits (`feat:`, `fix:`, `chore:` …): после squash он
становится сообщением коммита в `main`. Merge в `main` = деплой на Railway.
