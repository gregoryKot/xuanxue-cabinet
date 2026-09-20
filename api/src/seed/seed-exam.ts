// CLI: одноразовый импорт экзамена из файла сида в Mongo (docs/PLAN.md §11).
// Запуск: npm run seed:exam --workspace=api -- <путь к файлу>
// (без пути — api/seed/exam-form-1.json). Собранный файл (dist/), не
// исходник — devDependencies без ts-node, только tsc + node (RUNBOOK §2.2).
// Только bootstrap: путь и формат ошибки — в seed-report.ts, формат отчёта —
// в seed-exam-report.ts (чистая логика, свои юнит-тесты; CLAUDE.md «Логика
// вне контроллеров»).
import { resolve } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { EXAM_SEED_EXAMPLE_PATH } from './seed-exam-file';
import { formatExamSeedReport } from './seed-exam-report';
import { formatSeedFailure, resolveSeedPath } from './seed-report';

// dist/seed/seed-exam.js → корень репозитория: seed → dist → api → корень.
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const logger = new Logger('SeedExam');

async function main(): Promise<void> {
  const filePath = resolveSeedPath(process.argv[2], REPO_ROOT, EXAM_SEED_EXAMPLE_PATH);

  // Тот же приём, что seed-classes.ts: переменная ставится ДО динамического
  // импорта AppModule — ConfigModule.forRoot читает SCHEDULER_ENABLED
  // синхронно при импорте app.module.ts.
  process.env.SCHEDULER_ENABLED = 'false';

  const { AppModule } = await import('../app.module');
  const { SeedExamService } = await import('./seed-exam.service');

  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

  try {
    const report = await app.get(SeedExamService).importExam(filePath);
    // warn, не log: единственный вывод CLI должен остаться видимым, даже
    // если оператор поднял LOG_LEVEL выше info в своём окружении (RUNBOOK §2.2).
    logger.warn(formatExamSeedReport(report));
  } catch (err) {
    for (const line of formatSeedFailure(err, filePath, EXAM_SEED_EXAMPLE_PATH)) {
      logger.error(line);
    }
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
