// Валидация env при старте (ConfigModule.forRoot({ validate: validateEnv })) —
// падение с понятным списком проблем лучше молчаливого дефолта (CLAUDE.md
// «Безопасность»). Регэкспы и сообщения — в ./env.rules.ts (комментарий там,
// почему сам класс не переехал).
import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import {
  BOOTSTRAP_ADMIN_TELEGRAM_ID_MESSAGE,
  BOT_TOKEN_MESSAGE,
  BOT_TOKEN_RE,
  ENCRYPTION_KEY_MESSAGE,
  ENCRYPTION_KEY_OLD_MESSAGE,
  GIT_SHA_RE,
  HEX64_LIST_RE,
  HEX64_RE,
  JWT_SECRET_MESSAGE,
  LOG_LEVEL_MESSAGE,
  LOG_LEVELS,
  MONGO_URI_RE,
  MONGODB_URI_MESSAGE,
  NODE_ENV_MESSAGE,
  NODE_ENVS,
  NO_TRAILING_SLASH_RE,
  PORT_MESSAGE,
  PUBLIC_URL_MESSAGE,
  PUBLIC_URL_TRAILING_SLASH_MESSAGE,
  RAILWAY_GIT_COMMIT_SHA_MESSAGE,
  SCHEDULER_ENABLED_MESSAGE,
  TELEGRAM_WEBHOOK_SECRET_MESSAGE,
  TELEGRAM_WEBHOOK_SECRET_RE,
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

  // Вход через Telegram: при первом входе с этим Telegram ID
  // пользователь получает роли admin и teacher. Переменную убирают после
  // первого входа админа — дальше роли назначаются в интерфейсе.
  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: BOOTSTRAP_ADMIN_TELEGRAM_ID_MESSAGE })
  BOOTSTRAP_ADMIN_TELEGRAM_ID?: number;

  @IsOptional()
  @IsUrl(
    { require_tld: false, require_protocol: true, protocols: ['http', 'https'] },
    { message: PUBLIC_URL_MESSAGE },
  )
  @Matches(NO_TRAILING_SLASH_RE, { message: PUBLIC_URL_TRAILING_SLASH_MESSAGE })
  PUBLIC_URL?: string;

  // Секрет вебхука бота (SECURITY §2): сравнивается с заголовком
  // x-telegram-bot-api-secret-token через timingSafeEqual. Не задан — вебхук
  // выключен (503), как вход через Telegram без BOT_TOKEN.
  @IsOptional()
  @Matches(TELEGRAM_WEBHOOK_SECRET_RE, { message: TELEGRAM_WEBHOOK_SECRET_MESSAGE })
  TELEGRAM_WEBHOOK_SECRET?: string;

  @IsIn(LOG_LEVELS, { message: LOG_LEVEL_MESSAGE })
  LOG_LEVEL: LogLevel = 'info';

  // Строкой, не `@Type(() => Boolean)` — он превращает любую непустую
  // строку, включая 'false', в true. Выключают только в e2e (create-app.ts).
  @IsIn(['true', 'false'], { message: SCHEDULER_ENABLED_MESSAGE })
  SCHEDULER_ENABLED: 'true' | 'false' = 'true';

  // Ставит Railway сама — SHA коммита деплоя, /api/health отдаёт короткий
  // вариант (health-commit.ts, RUNBOOK §2 п.1). Локально не нужна.
  @IsOptional()
  @Matches(GIT_SHA_RE, { message: RAILWAY_GIT_COMMIT_SHA_MESSAGE })
  RAILWAY_GIT_COMMIT_SHA?: string;
}

// Поля, где пустая строка (`VAR=` в .env) равносильна отсутствию переменной —
// иначе она попадёт в валидацию как невалидное значение вместо дефолта/skip.
const EMPTY_AS_ABSENT: (keyof EnvSchema)[] = [
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
];

export function validateEnv(raw: Record<string, unknown>): EnvSchema {
  const input: Record<string, unknown> = { ...raw };
  for (const key of EMPTY_AS_ABSENT) {
    if (input[key] === '') delete input[key];
  }

  const instance = plainToInstance(EnvSchema, input, { enableImplicitConversion: true });
  const errors = validateSync(instance, { whitelist: true });
  const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));

  // Кросс-полевые правила («обязателен в production»): class-validator
  // @ValidateIf применяет одно условие ко ВСЕМ декораторам поля сразу, поэтому
  // «обязателен в prod, но формат проверяется всегда» проще и понятнее
  // выразить явной проверкой здесь, чем городить кастомный валидатор.
  if (instance.NODE_ENV === 'production') {
    if (!instance.ENCRYPTION_KEY) messages.push('ENCRYPTION_KEY обязателен в production');
    if (!instance.JWT_SECRET) messages.push('JWT_SECRET обязателен в production');
    if (!instance.PUBLIC_URL) messages.push('PUBLIC_URL обязателен в production');
  }

  if (messages.length > 0) {
    throw new Error(
      'Некорректная конфигурация окружения:\n' +
        messages.map((message) => `  - ${message}`).join('\n'),
    );
  }

  return instance;
}
