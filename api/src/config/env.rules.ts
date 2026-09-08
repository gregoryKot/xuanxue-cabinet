// Регэкспы, списки допустимых значений и длинные сообщения валидатора —
// вынесены из env.validation.ts, чтобы файл со схемой (`EnvSchema`) не
// раздувался вместе с числом переменных выше потолка 150 строк (CLAUDE.md
// «Храповики»). Класс EnvSchema остаётся в env.validation.ts: его читает
// scripts/check-env-example.mjs регэкспом по полям класса — переносить
// схему сюда нельзя, переменные перестанут попадать в сверку.
export const NODE_ENVS = ['development', 'test', 'production'] as const;
// 'silent' — только для тестов: e2e не должны засыпать вывод логами запросов.
export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;

export const MONGO_URI_RE = /^mongodb(\+srv)?:\/\//;
export const HEX64_RE = /^[0-9a-fA-F]{64}$/;
export const HEX64_LIST_RE = /^[0-9a-fA-F]{64}(\s*,\s*[0-9a-fA-F]{64})*$/;
export const BOT_TOKEN_RE = /^\d+:[\w-]{30,}$/;
// Формат secret_token из документации Telegram (setWebhook): 1–256 символов,
// латиница/цифры/подчёркивание/дефис.
export const TELEGRAM_WEBHOOK_SECRET_RE = /^[A-Za-z0-9_-]{1,256}$/;
// TelegramBotService.registerWebhook собирает URL через `new URL(path, base)`
// (устойчиво к завершающему слэшу сам по себе), но лишний слэш в PUBLIC_URL —
// источник и других ссылок (рассылки, email-вход) — запрещаем на входе, а не
// только для одного потребителя.
export const NO_TRAILING_SLASH_RE = /[^/]$/;
// RAILWAY_GIT_COMMIT_SHA — полный SHA-1 коммита, Railway ставит саму
// переменную (см. env.validation.ts); формат не жёсткий, потому что значение
// приходит от платформы, не от человека — только «это похоже на SHA», чтобы
// опечатка в чужой Railway-переменной с тем же именем не прошла тихо.
export const GIT_SHA_RE = /^[0-9a-f]{7,40}$/i;

export const NODE_ENV_MESSAGE =
  'NODE_ENV должен быть одним из: development, test, production';
export const PORT_MESSAGE = 'PORT должен быть числом от 1 до 65535';
export const MONGODB_URI_MESSAGE =
  'MONGODB_URI должен начинаться с mongodb:// или mongodb+srv://';
export const ENCRYPTION_KEY_MESSAGE =
  'ENCRYPTION_KEY должен быть строкой из 64 hex-символов (32 байта)';
export const ENCRYPTION_KEY_OLD_MESSAGE =
  'ENCRYPTION_KEY_OLD должен быть списком 64-hex ключей через запятую';
export const JWT_SECRET_MESSAGE = 'JWT_SECRET должен быть не короче 32 символов';
export const BOT_TOKEN_MESSAGE = 'BOT_TOKEN должен быть в формате <числовой id>:<токен>';
export const BOOTSTRAP_ADMIN_TELEGRAM_ID_MESSAGE =
  'BOOTSTRAP_ADMIN_TELEGRAM_ID должен быть положительным числом (Telegram ID)';
export const PUBLIC_URL_MESSAGE = 'PUBLIC_URL должен быть корректным http(s) URL';
export const PUBLIC_URL_TRAILING_SLASH_MESSAGE = 'PUBLIC_URL без завершающего слэша';
export const TELEGRAM_WEBHOOK_SECRET_MESSAGE =
  'TELEGRAM_WEBHOOK_SECRET должен быть 1-256 символов: латиница, цифры, "_" и "-"';
export const LOG_LEVEL_MESSAGE =
  'LOG_LEVEL должен быть одним из: fatal, error, warn, info, debug, trace, silent';
export const SCHEDULER_ENABLED_MESSAGE = 'SCHEDULER_ENABLED должен быть true или false';
export const RAILWAY_GIT_COMMIT_SHA_MESSAGE =
  'RAILWAY_GIT_COMMIT_SHA должен быть SHA коммита (7-40 hex-символов)';
