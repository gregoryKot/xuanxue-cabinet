// Схема окружения: одно поле — одна переменная, формат проверяется
// декораторами class-validator. Регэкспы и сообщения — в ./env.rules.ts,
// сам прогон валидации — в ./env.validate.ts (комментарии там, почему).
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import {
  BOOTSTRAP_ADMIN_TELEGRAM_ID_MESSAGE,
  BOT_TOKEN_MESSAGE,
  BOT_TOKEN_RE,
  ENCRYPTION_KEY_MESSAGE,
  ENCRYPTION_KEY_OLD_MESSAGE,
  GIT_SHA_RE,
  HEARTBEAT_PING_URL_MESSAGE,
  HEX64_LIST_RE,
  HEX64_RE,
  HTTP_URL_OPTIONS,
  JWT_SECRET_MESSAGE,
  LOG_LEVEL_MESSAGE,
  LOG_LEVELS,
  MAIL_FROM_MESSAGE,
  MAIL_FROM_RE,
  MONGO_URI_RE,
  MONGODB_URI_MESSAGE,
  NODE_ENV_MESSAGE,
  NODE_ENVS,
  NO_TRAILING_SLASH_RE,
  PORT_MESSAGE,
  PUBLIC_URL_MESSAGE,
  PUBLIC_URL_TRAILING_SLASH_MESSAGE,
  R2_ACCESS_KEY_ID_MESSAGE,
  R2_ACCESS_KEY_ID_RE,
  R2_ACCOUNT_ID_MESSAGE,
  R2_ACCOUNT_ID_RE,
  R2_BUCKET_MESSAGE,
  R2_BUCKET_RE,
  R2_SECRET_ACCESS_KEY_MESSAGE,
  RAILWAY_GIT_COMMIT_SHA_MESSAGE,
  SCHEDULER_ENABLED_MESSAGE,
  TELEGRAM_WEBHOOK_SECRET_MESSAGE,
  TELEGRAM_WEBHOOK_SECRET_RE,
  VAPID_PRIVATE_KEY_MESSAGE,
  VAPID_PRIVATE_KEY_RE,
  VAPID_PUBLIC_KEY_MESSAGE,
  VAPID_PUBLIC_KEY_RE,
  VAPID_SUBJECT_MESSAGE,
  VAPID_SUBJECT_RE,
} from './env.rules';

export type NodeEnv = (typeof NODE_ENVS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

export class EnvSchema {
  @IsIn(NODE_ENVS, { message: NODE_ENV_MESSAGE })
  NODE_ENV: NodeEnv = 'development';

  @Type(() => Number)
  @Min(1, { message: PORT_MESSAGE })
  @Max(65535, { message: PORT_MESSAGE })
  PORT: number = 3000;

  @IsNotEmpty({ message: 'MONGODB_URI обязателен' })
  @Matches(MONGO_URI_RE, { message: MONGODB_URI_MESSAGE })
  MONGODB_URI!: string;

  @IsOptional()
  @Matches(HEX64_RE, { message: ENCRYPTION_KEY_MESSAGE })
  ENCRYPTION_KEY?: string;

  @IsOptional()
  @Matches(HEX64_LIST_RE, { message: ENCRYPTION_KEY_OLD_MESSAGE })
  ENCRYPTION_KEY_OLD?: string;

  @IsOptional()
  @MinLength(32, { message: JWT_SECRET_MESSAGE })
  JWT_SECRET?: string;

  @IsOptional()
  @Matches(BOT_TOKEN_RE, { message: BOT_TOKEN_MESSAGE })
  BOT_TOKEN?: string;

  // Первый вход с этим Telegram ID получает роли admin+teacher, дальше роли — в интерфейсе.
  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: BOOTSTRAP_ADMIN_TELEGRAM_ID_MESSAGE })
  BOOTSTRAP_ADMIN_TELEGRAM_ID?: number;

  @IsOptional()
  @IsUrl(HTTP_URL_OPTIONS, { message: PUBLIC_URL_MESSAGE })
  @Matches(NO_TRAILING_SLASH_RE, { message: PUBLIC_URL_TRAILING_SLASH_MESSAGE })
  PUBLIC_URL?: string;

  // Секрет вебхука бота (SECURITY §2). Обязателен в production — без него бот
  // молча не работал на проде (2026-09-08); 503 — только вне prod.
  @IsOptional()
  @Matches(TELEGRAM_WEBHOOK_SECRET_RE, { message: TELEGRAM_WEBHOOK_SECRET_MESSAGE })
  TELEGRAM_WEBHOOK_SECRET?: string;

  @IsIn(LOG_LEVELS, { message: LOG_LEVEL_MESSAGE })
  LOG_LEVEL: LogLevel = 'info';

  // Строкой: `@Type(() => Boolean)` превратил бы 'false' в true. Выключают только в e2e.
  @IsIn(['true', 'false'], { message: SCHEDULER_ENABLED_MESSAGE })
  SCHEDULER_ENABLED: 'true' | 'false' = 'true';

  // Ставит Railway сама (короткий вариант — /api/health, RUNBOOK §2 п.1). Локально не нужна.
  @IsOptional()
  @Matches(GIT_SHA_RE, { message: RAILWAY_GIT_COMMIT_SHA_MESSAGE })
  RAILWAY_GIT_COMMIT_SHA?: string;

  // Кнопка жизни dead man's switch (ADR-0112), не задана — пинга нет.
  @IsOptional()
  @IsUrl(HTTP_URL_OPTIONS, { message: HEARTBEAT_PING_URL_MESSAGE })
  HEARTBEAT_PING_URL?: string;

  // Email-вход (ADR-0029) — опциональны, без них выключен, production не требует.
  @IsOptional()
  RESEND_API_KEY?: string;

  @IsOptional()
  @Matches(MAIL_FROM_RE, { message: MAIL_FROM_MESSAGE })
  MAIL_FROM?: string;

  // Файлы материалов в Cloudflare R2 (ADR-0057) — все четыре или ни одной
  // (env.r2-group.ts). Без них загрузка выключена, кабинет поднимается как
  // прежде: локальная разработка, CI и Docker-смок хранилища не касаются.
  @IsOptional()
  @Matches(R2_ACCOUNT_ID_RE, { message: R2_ACCOUNT_ID_MESSAGE })
  R2_ACCOUNT_ID?: string;

  @IsOptional()
  @Matches(R2_ACCESS_KEY_ID_RE, { message: R2_ACCESS_KEY_ID_MESSAGE })
  R2_ACCESS_KEY_ID?: string;

  @IsOptional()
  @MinLength(32, { message: R2_SECRET_ACCESS_KEY_MESSAGE })
  R2_SECRET_ACCESS_KEY?: string;

  @IsOptional()
  @Matches(R2_BUCKET_RE, { message: R2_BUCKET_MESSAGE })
  R2_BUCKET?: string;

  // Push-уведомления браузера (ADR-0092) — три переменные все вместе или ни
  // одной (env.vapid-group.ts), как у R2 выше. Без них push выключен: риск
  // сначала на владельце (CLAUDE.md «Рискованная фича — за флагом»),
  // отсутствие ключей и есть выключатель. Пара — scripts/generate-vapid-keys.mjs.
  @IsOptional()
  @Matches(VAPID_PUBLIC_KEY_RE, { message: VAPID_PUBLIC_KEY_MESSAGE })
  VAPID_PUBLIC_KEY?: string;

  @IsOptional()
  @Matches(VAPID_PRIVATE_KEY_RE, { message: VAPID_PRIVATE_KEY_MESSAGE })
  VAPID_PRIVATE_KEY?: string;

  @IsOptional()
  @Matches(VAPID_SUBJECT_RE, { message: VAPID_SUBJECT_MESSAGE })
  VAPID_SUBJECT?: string;
}
