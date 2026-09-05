// Поднимает реальный AppModule на MongoMemoryServer для e2e-тестов. Использует
// ту же configureApp(), что и main.ts (правило CLAUDE.md «одна механика —
// одно место») — иначе e2e тестирует не то поведение, что видит пользователь
// в проде (другие пайпы/фильтры/префикс).
import { Test } from '@nestjs/testing';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { MongoMemoryServer } from 'mongodb-memory-server';

export interface TestApp {
  app: NestExpressApplication;
  close: () => Promise<void>;
}

// Валидный тестовый конфиг окружения (env.validation.ts) — процесс без
// реального .env. process.env трогаем напрямую только здесь и в самом
// env.validation.ts/encryption.ts, как и разрешает CLAUDE.md.
function setTestEnv(mongoUri: string): void {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongoUri;
  process.env.ENCRYPTION_KEY = 'a1'.repeat(32);
  process.env.JWT_SECRET = 'e2e-test-jwt-secret-32-characters-min';
  process.env.PUBLIC_URL = 'http://localhost:3000';
  // Логи запросов не нужны в выводе тестов — при падении смотрят ответ, не лог.
  process.env.LOG_LEVEL = 'silent';
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
