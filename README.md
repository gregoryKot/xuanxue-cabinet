# Xuanxue Cabinet

Кабинет школы тайцзицюань «Сюань-Сюэ» (玄学): расписание, автоматические рассылки
ссылок и записей, оплаты, материалы, экзамены. Для учителей, администратора и учеников.

- План проекта и этапы: [docs/PLAN.md](docs/PLAN.md)
- Правила разработки: [CLAUDE.md](CLAUDE.md)
- Голос продукта: [docs/VOICE.md](docs/VOICE.md)

## Стек

NestJS + Mongoose, React + Vite, MongoDB Atlas, Railway. Один сервис: API раздаёт
статику фронта и принимает вебхук Telegram-бота.

## Структура

```
api/        NestJS
web/        React SPA
shared/     типы, константы, чистые утилиты для api и web
docs/       план, стиль-гайд
scripts/    CI-храповики
```

## Локальный запуск

```bash
npm install
cp .env.example .env      # заполнить MONGODB_URI, BOT_TOKEN, ENCRYPTION_KEY
npm run dev               # api на :3000, web на :5173
```

Реальные ссылки Zoom для первого импорта лежат в `api/seed/classes.local.json`,
файл в `.gitignore`. Формат — `api/seed/classes.example.json`.
