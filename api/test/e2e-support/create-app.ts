// Поднимает реальный AppModule на MongoMemoryServer для e2e-тестов. Использует
// ту же configureApp(), что и main.ts (правило CLAUDE.md «одна механика —
// одно место») — иначе e2e тестирует не то поведение, что видит пользователь
// в проде (другие пайпы/фильтры/префикс).
import { randomBytes } from 'crypto';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { MongoMemoryServer } from 'mongodb-memory-server';

export interface TestApp {
  app: NestExpressApplication;
  close: () => Promise<void>;
}

// Тестовые BOT_TOKEN/BOOTSTRAP_ADMIN_TELEGRAM_ID — общие для всех e2e на
// приложении из этого файла (auth-telegram.e2e-spec.ts подписывает ими
// тела запросов). Формат токена — как настоящий (числовой id бота, потом
// секрет), но сам секрет — randomBytes на процесс, не литерал (gitleaks).
export const TEST_BOT_TOKEN = `123456:${randomBytes(18).toString('hex').slice(0, 35)}`;
export const TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID = 900_000_001;
// Секрет вебхука бота — сгенерирован на процесс, не литерал (gitleaks), как
// и TEST_BOT_TOKEN выше. telegram-webhook.e2e-spec.ts подписывает им запросы.
export const TEST_TELEGRAM_WEBHOOK_SECRET = randomBytes(24).toString('hex');

// Валидный тестовый конфиг окружения (env.validation.ts) — процесс без
// реального .env. process.env трогаем напрямую только здесь и в самом
// env.validation.ts/encryption.ts, как и разрешает CLAUDE.md.
function setTestEnv(mongoUri: string): void {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongoUri;
  // Ключи генерируются на каждый прогон: литерал секрета в коде — находка
  // gitleaks, даже тестовая, и привычка хранить «заглушки» в репозитории.
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  process.env.PUBLIC_URL = 'http://localhost:3000';
  process.env.BOT_TOKEN = TEST_BOT_TOKEN;
  process.env.BOOTSTRAP_ADMIN_TELEGRAM_ID = String(TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID);
  process.env.TELEGRAM_WEBHOOK_SECRET = TEST_TELEGRAM_WEBHOOK_SECRET;
  // Логи запросов не нужны в выводе тестов — при падении смотрят ответ, не лог.
  process.env.LOG_LEVEL = 'silent';
  // Реальный AppModule в e2e держит ScheduleModule с cron раз в минуту — тик
  // планировщика занятий на настоящем времени лишний в коротких e2e и
  // рискует гонкой с app.close(); юнит-тесты LessonPlannerService/
  // SchedulerService идут напрямую, без этого приложения.
  process.env.SCHEDULER_ENABLED = 'false';
}

/**
 * `overrides` — точка расширения для e2e, которым нужен настоящий AppModule,
 * но с одной подменённой зависимостью (channels.e2e-spec.ts: фейковый
 * `TelegramClientFactory`, чтобы `/channels/:id/test` не ходил в сеть).
 * Не `NODE_ENV`-проверка внутри самого сервиса (SECURITY §2 — никаких
 * обходов по окружению в бизнес-коде): подмена — только в тестовой сборке
 * модуля, прод-код о её существовании не знает.
 *
 * `envOverrides` — точечная правка process.env поверх setTestEnv() (напр.
 * auth-config.e2e-spec.ts проверяет ответ без BOT_TOKEN: `{ BOT_TOKEN:
 * undefined }` удаляет переменную). Применяется до импорта AppModule —
 * ConfigModule.forRoot({ validate }) читает env синхронно при загрузке
 * модуля (см. комментарий ниже), после импорта менять уже поздно.
 */
export async function createTestApp(
  overrides?: (builder: TestingModuleBuilder) => void,
  envOverrides?: Record<string, string | undefined>,
): Promise<TestApp> {
  const mongod = await MongoMemoryServer.create();
  try {
    setTestEnv(mongod.getUri());
    for (const [key, value] of Object.entries(envOverrides ?? {})) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    // Импорт AppModule ОБЯЗАН быть динамическим и ПОСЛЕ setTestEnv(): у
    // @Module() декоратора ConfigModule.forRoot({ validate }) выполняется
    // синхронно в момент загрузки модуля — статический import вверху файла
    // исполнился бы до того, как MONGODB_URI попал в process.env, и
    // validateEnv падал бы на пустой конфигурации.
    const { AppModule } = await import('../../src/app.module');
    const { configureApp } = await import('../../src/app.setup');

    const builder = Test.createTestingModule({ imports: [AppModule] });
    overrides?.(builder);
    const moduleRef = await builder.compile();
    // Явный ExpressAdapter — та же причина, что в main.ts: @nestjs/platform-express
    // лежит в api/node_modules, автозагрузка адаптера из @nestjs/core (корневой
    // node_modules) его не находит. У @nestjs/testing есть свой (рабочий здесь)
    // путь автозагрузки, но одна механика — одно место (CLAUDE.md).
    const app = moduleRef.createNestApplication<NestExpressApplication>(
      new ExpressAdapter(),
      {
        bufferLogs: true,
        bodyParser: false,
      },
    );
    configureApp(app);
    await app.init();

    return {
      app,
      close: async () => {
        await app.close();
        await mongod.stop();
      },
    };
  } catch (err) {
    // Приложение не поднялось — за собой всё равно нужно убрать mongod,
    // иначе он переживает тест и держит процесс Jest открытым.
    await mongod.stop();
    throw err;
  }
}
