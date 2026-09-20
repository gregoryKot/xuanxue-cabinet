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

Вопросы первого экзамена с фотографиями — тем же способом, только файл лежит
в репозитории открыто (секретов в нём нет), см. ADR-0064 и RUNBOOK §2.3:

```bash
npm run seed:exam --workspace=api -- api/seed/exam-form-1.json
```

Вход через Telegram (переход на `oauth.telegram.org`, `POST /auth/telegram`) локально
не проверить: переход работает только с доменом, привязанным к боту в BotFather
(`/setdomain`) — у `localhost` такого домена нет. `BOT_TOKEN` — тот же,
что у вебхука бота (`.env.example`); отдельная переменная для виджета не нужна,
`GET /auth/config` сам достаёт числовой id бота из `BOT_TOKEN`. `/start` в боте
регистрирует чат как канал рассылки (docs/PLAN.md §6, «Каналы»), но сессию кабинета не
выдаёт. Локальный вход — только ручная подмена cookie, см. `api/test/e2e-support/session.ts`,
как её делают тесты.

## Перед PR

```bash
npm run check             # tsc, eslint, prettier, тесты (jest api дважды — TZ=Australia/Sydney
                           # и с покрытием; vitest web — с покрытием и под TZ=Australia/Sydney),
                           # npm audit, все храповики — то же, что CI, кроме gitleaks (бинаря
                           # нет локально), Docker-смока и проверки бэкапа-восстановления
                           # (backup-restore, нужен mongodump): они только в CI
```

Шаги живут списком в `scripts/check.mjs`, новый заводится там же. Раннер запускает
каждый сам и краснеет, даже когда шаг убит сигналом, а не кодом выхода: так упавший
от нехватки памяти e2e перестал выглядеть успешным прогоном (ADR-0077).

Пороги покрытия web и shared живут не в конфиге, а в `scripts/vitest-coverage-baseline.json`:
`scripts/check-vitest-coverage-ratchet.mjs <web|shared>` сам гоняет vitest и сравнивает
покрытие с бейслайном, ничего не переписывая в дереве — рост покрытия фиксируется
явным `--update` (аудит 2026-09-12, H2 и M5).

Заголовок PR — по Conventional Commits (`feat:`, `fix:`, `chore:` …): после squash он
становится сообщением коммита в `main`. Merge в `main` = деплой на Railway.
