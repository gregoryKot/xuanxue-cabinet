// Валидация переменных окружения при старте приложения. Подключается как
// `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })` —
// падение при старте с понятным списком проблем лучше молчаливого дефолта
// или обвала где-то в глубине бизнес-логики (правило CLAUDE.md «Безопасность»:
// env только через ConfigService).
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

export type NodeEnv = 'development' | 'test' | 'production';
// 'silent' — только для тестов: e2e не должны засыпать вывод логами запросов.
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

const NODE_ENVS: NodeEnv[] = ['development', 'test', 'production'];
const LOG_LEVELS: LogLevel[] = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
];
const MONGO_URI_RE = /^mongodb(\+srv)?:\/\//;
const HEX64_RE = /^[0-9a-fA-F]{64}$/;
const HEX64_LIST_RE = /^[0-9a-fA-F]{64}(\s*,\s*[0-9a-fA-F]{64})*$/;
const BOT_TOKEN_RE = /^\d+:[\w-]{30,}$/;

export class EnvSchema {
  @IsIn(NODE_ENVS, {
    message: 'NODE_ENV должен быть одним из: development, test, production',
  })
  NODE_ENV: NodeEnv = 'development';

  @Type(() => Number)
  @Min(1, { message: 'PORT должен быть числом от 1 до 65535' })
  @Max(65535, { message: 'PORT должен быть числом от 1 до 65535' })
  PORT: number = 3000;

  @IsNotEmpty({ message: 'MONGODB_URI обязателен' })
  @Matches(MONGO_URI_RE, {
    message: 'MONGODB_URI должен начинаться с mongodb:// или mongodb+srv://',
  })
  MONGODB_URI!: string;

  @IsOptional()
  @Matches(HEX64_RE, {
    message: 'ENCRYPTION_KEY должен быть строкой из 64 hex-символов (32 байта)',
  })
  ENCRYPTION_KEY?: string;

  @IsOptional()
  @Matches(HEX64_LIST_RE, {
    message: 'ENCRYPTION_KEY_OLD должен быть списком 64-hex ключей через запятую',
  })
  ENCRYPTION_KEY_OLD?: string;

  @IsOptional()
  @MinLength(32, { message: 'JWT_SECRET должен быть не короче 32 символов' })
  JWT_SECRET?: string;

  @IsOptional()
  @Matches(BOT_TOKEN_RE, {
    message: 'BOT_TOKEN должен быть в формате <числовой id>:<токен>',
  })
  BOT_TOKEN?: string;

  // Вход через Telegram: при первом входе с этим Telegram ID
  // пользователь получает роли admin и teacher. Переменную убирают после
  // первого входа админа — дальше роли назначаются в интерфейсе.
  @IsOptional()
  @Type(() => Number)
  @Min(1, {
    message: 'BOOTSTRAP_ADMIN_TELEGRAM_ID должен быть положительным числом (Telegram ID)',
  })
  BOOTSTRAP_ADMIN_TELEGRAM_ID?: number;

  @IsOptional()
  @IsUrl(
    { require_tld: false, require_protocol: true, protocols: ['http', 'https'] },
    { message: 'PUBLIC_URL должен быть корректным http(s) URL' },
  )
  PUBLIC_URL?: string;

  @IsIn(LOG_LEVELS, {
    message:
      'LOG_LEVEL должен быть одним из: fatal, error, warn, info, debug, trace, silent',
  })
  LOG_LEVEL: LogLevel = 'info';
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
  'MONGODB_URI',
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
