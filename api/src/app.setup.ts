// Общая настройка Nest-приложения — вызывается и из main.ts (прод), и из
// test/e2e-support/create-app.ts (e2e), чтобы поведение сервера не
// расходилось с тем, что видят тесты (правило CLAUDE.md «одна механика —
// одно место»). Сюда НЕ входит .listen() — в e2e его не вызывают.
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { EXAM_IMAGE_LIMITS } from '@xuanxue/shared';
import { CSP_DIRECTIVES } from './security/csp';
import { DomainExceptionFilter } from './common/domain-exception.filter';
import { formatValidationErrors } from './common/validation-messages';
import { isExamImageUpload } from './exam-images/exam-image-body';

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
  // Сырое тело — единственное исключение из «файлы мимо API» (ADR-0035,
  // SECURITY §4): только картинки вариантов ответа. Включается по
  // предикату маршрута и заявленного типа (exam-image-body.ts), а не по
  // image/* глобально — иначе такое тело в любом другом запросе стало бы
  // Buffer, и ValidationPipe (whitelist/forbidNonWhitelisted) перебирал бы
  // его как «лишние поля».
  app.useBodyParser('raw', {
    type: isExamImageUpload,
    limit: EXAM_IMAGE_LIMITS.maxBytes,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Неизвестное поле в форме кабинета — опечатка или рассинхрон
      // фронта с DTO, не «прислали лишнее и ладно» (CLAUDE.md «Ошибки»:
      // details должны говорить, что не так). Единственное исключение —
      // POST /auth/telegram: этот пайп на него вообще не срабатывает
      // (`@Body()` там нетипизированный, см. parse-telegram-login-body.ts) —
      // виджет Telegram подписывает HMAC'ом все переданные поля целиком,
      // лишние безопасно отбрасывать молча, а не ронять вход всей школе,
      // если Telegram однажды добавит виджету новое необязательное поле.
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException(formatValidationErrors(errors)),
    }),
  );
  app.useGlobalFilters(app.get(DomainExceptionFilter));
}
