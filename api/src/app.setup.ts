// Общая настройка Nest-приложения — вызывается и из main.ts (прод), и из
// test/e2e-support/create-app.ts (e2e), чтобы поведение сервера не
// расходилось с тем, что видят тесты (правило CLAUDE.md «одна механика —
// одно место»). Сюда НЕ входит .listen() — в e2e его не вызывают.
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { CSP_DIRECTIVES } from './security/csp';
import { DomainExceptionFilter } from './common/domain-exception.filter';

export function configureApp(app: NestExpressApplication): void {
  // nestjs-pino вместо встроенного логгера Nest — правило CLAUDE.md «Ошибки»:
  // логгер, не console. Требует bufferLogs: true при NestFactory.create.
  app.useLogger(app.get(Logger));

  // За прокси Railway — иначе троттлер и логи видят IP балансировщика, а не клиента.
  app.set('trust proxy', 1);
  // Railway шлёт SIGTERM при каждом деплое — даём планировщику дотикать текущий цикл.
  app.enableShutdownHooks();

  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: CSP_DIRECTIVES },
    }),
  );

  // bodyParser отключён в NestFactory.create (см. main.ts/create-app.ts) —
  // иначе дефолтный парсер (лимит ~100kb) успевает отработать первым, и наш
  // лимит ниже никогда не применяется.
  app.useBodyParser('json', { limit: '1mb' });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(app.get(DomainExceptionFilter));
}
