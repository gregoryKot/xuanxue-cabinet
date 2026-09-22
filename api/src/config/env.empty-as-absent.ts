// Переменные, где `VAR=` (пустая строка в .env) значит то же, что её
// отсутствие. Вынесено из env.validation.ts: тот файл читает
// scripts/check-env-example.mjs регэкспом по полям класса `EnvSchema`, и
// расти ему дальше некуда (CLAUDE.md «Храповики», потолок 150 строк).
//
// Список — имена строками, а не `keyof EnvSchema`: импорт схемы отсюда
// замкнул бы цикл (eslint `import-x/no-cycle`), а обратная сверка живёт в
// спеке env.validation.spec.ts.
export const EMPTY_AS_ABSENT_KEYS = [
  'NODE_ENV',
  'PORT',
  'LOG_LEVEL',
  'ENCRYPTION_KEY',
  'ENCRYPTION_KEY_OLD',
  'JWT_SECRET',
  'BOT_TOKEN',
  'BOOTSTRAP_ADMIN_TELEGRAM_ID',
  'PUBLIC_URL',
  'TELEGRAM_WEBHOOK_SECRET',
  'MONGODB_URI',
  'SCHEDULER_ENABLED',
  'RAILWAY_GIT_COMMIT_SHA',
  'HEARTBEAT_PING_URL',
  'RESEND_API_KEY',
  'MAIL_FROM',
  // Незаполненные R2_* в .env — «хранилище не подключено», а не «задано
  // пустым»: иначе правило «все четыре или ни одной» (env.r2-group.ts)
  // ругалось бы на файл, в котором просто стоят четыре пустые строки.
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  // Push (ADR-0092) — та же логика: три пустые строки в .env значат
  // «выключено», а не «половина набора» для env.vapid-group.ts.
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
] as const;
