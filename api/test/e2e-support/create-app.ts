// Поднимает реальный AppModule на MongoMemoryServer для e2e-тестов. Использует
// ту же configureApp(), что и main.ts (правило CLAUDE.md «одна механика —
// одно место») — иначе e2e тестирует не то поведение, что видит пользователь
// в проде (другие пайпы/фильтры/префикс).
import { randomBytes } from 'crypto';
import { Test } from '@nestjs/testing';
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
  // Логи запросов не нужны в выводе тестов — при падении смотрят ответ, не лог.
  process.env.LOG_LEVEL = 'silent';
  // Реальный AppModule в e2e держит ScheduleModule с cron раз в минуту — тик
  // планировщика занятий на настоящем времени лишний в коротких e2e и
  // рискует гонкой с app.close(); юнит-тесты LessonPlannerService/
  // SchedulerService идут напрямую, без этого приложения.
  process.env.SCHEDULER_ENABLED = 'false';
}

export async function createTestApp(): Promise<TestApp> {
  const mongod = await MongoMemoryServer.create();
  try {
    setTestEnv(mongod.getUri());

    // Импорт AppModule ОБЯЗАН быть динамическим и ПОСЛЕ setTestEnv(): у
    // @Module() декоратора ConfigModule.forRoot({ validate }) выполняется
    // синхронно в момент загрузки модуля — статический import вверху файла
    // исполнился бы до того, как MONGODB_URI попал в process.env, и
    // validateEnv падал бы на пустой конфигурации.
    const { AppModule } = await import('../../src/app.module');
    const { configureApp } = await import('../../src/app.setup');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
