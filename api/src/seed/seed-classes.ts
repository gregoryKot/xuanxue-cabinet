// CLI: одноразовый импорт занятий из файла сида в Mongo (PLAN.md §9).
// Запуск: npm run seed:classes --workspace=api -- <путь к файлу>
// (без пути — api/seed/classes.local.json). Собранный файл (dist/), не
// исходник — devDependencies без ts-node, только tsc + node (RUNBOOK §2.2).
// Только bootstrap: путь, формат отчёта и формат ошибки — в seed-report.ts
// (чистая логика, свои юнит-тесты; CLAUDE.md «Логика вне контроллеров»).
import { resolve } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { SEED_EXAMPLE_PATH } from './seed-file';
import { formatSeedFailure, formatSeedReport, resolveSeedPath } from './seed-report';

// dist/seed/seed-classes.js → корень репозитория: seed → dist → api → корень.
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
// Путь по умолчанию — свой у каждого CLI сида (seed-report.ts принимает его
// параметром, не хранит сам).
const DEFAULT_RELATIVE_PATH = 'api/seed/classes.local.json';
const logger = new Logger('SeedClasses');

async function main(): Promise<void> {
  const filePath = resolveSeedPath(process.argv[2], REPO_ROOT, DEFAULT_RELATIVE_PATH);

  // Единственное разрешённое место process.env вне валидатора и тестовой
  // инфраструктуры (тот же приём — api/test/e2e-support/create-app.ts):
  // ConfigModule.forRoot читает SCHEDULER_ENABLED синхронно при импорте
  // app.module.ts, поэтому переменная ставится ДО динамического импорта —
  // иначе тик планировщика (раз в минуту) мог бы побежать во время импорта.
  process.env.SCHEDULER_ENABLED = 'false';

  const { AppModule } = await import('../app.module');
  const { SeedService } = await import('./seed.service');

  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

  try {
    const report = await app.get(SeedService).importClasses(filePath);
    // warn, не log: единственный вывод CLI должен остаться видимым, даже
    // если оператор поднял LOG_LEVEL выше info в своём окружении (RUNBOOK §2.2).
    logger.warn(formatSeedReport(report));
  } catch (err) {
    for (const line of formatSeedFailure(err, filePath, SEED_EXAMPLE_PATH)) {
      logger.error(line);
    }
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
