// Общая настройка Nest-приложения — вызывается и из main.ts (прод), и из
// test/e2e-support/create-app.ts (e2e), чтобы поведение сервера не
// расходилось с тем, что видят тесты (правило CLAUDE.md «одна механика —
// одно место»). Сюда НЕ входит .listen() — в e2e его не вызывают.
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import {
  ANSWER_VIDEO_LIMITS,
  EXAM_IMAGE_LIMITS,
  EXAM_VIDEO_LIMITS,
  MATERIAL_FILE_LIMITS,
} from '@xuanxue/shared';
import { SESSION_SECRET } from './auth/session-token';
import { CSP_DIRECTIVES } from './security/csp';
import { makeAppVersionHeader } from './common/app-version-header';
import { DomainExceptionFilter } from './common/domain-exception.filter';
import { makeRawUploadConcurrencyLimit } from './common/raw-upload-concurrency';
import { formatValidationErrors } from './common/validation-messages';
import { shortCommitSha } from './health/health-commit';
import { makeIsAnswerVideoPart } from './answer-videos/answer-video-part-body';
import { makeIsRawImageUpload } from './exam-images/exam-image-body';
import { makeIsExamVideoUpload } from './exam-videos/exam-video-body';
import { makeIsMaterialFileUpload } from './materials/material-file-body';

// Часть видео-ответа (ADR-0137) — свой бюджет одновременных сырых загрузок,
// отдельно от остальных трёх маршрутов: 8 × 8 МиБ = 64 МБ худший случай,
// поверх их общих 4 × 50 МБ (raw-upload-concurrency.ts). Больше частей одного
// файла может идти параллельно (браузер шлёт несколько сразу для скорости),
// но каждая часть меньше — общий бюджет соизмерим.
const ANSWER_VIDEO_PART_CONCURRENCY_LIMIT = 8;

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

  // Заголовок версии сборки (ADR-0101) — до парсеров тела и до маршрутов,
  // чтобы он был и на ответах об ошибке (400 от ValidationPipe, 5xx из
  // фильтра). Тот же короткий SHA, что в /api/health — health-commit.ts
  // режет его один раз на всё приложение.
  const config = app.get(ConfigService);
  app.use(
    makeAppVersionHeader(shortCommitSha(config.get<string>('RAILWAY_GIT_COMMIT_SHA'))),
  );

  // bodyParser отключён в NestFactory.create (см. main.ts/create-app.ts) —
  // иначе дефолтный парсер (лимит ~100kb) успевает отработать первым, и наш
  // лимит ниже никогда не применяется.
  app.useBodyParser('json', { limit: '1mb' });

  // Секрет сессии — из DI, один раз здесь (не в самих предикатах: они
  // чистые функции без Nest-контекста), и замыкается на оба предиката ниже
  // (SECURITY §4, ADR-0083, мера 1). app.get() безопасен до app.init():
  // NestExpressApplication резолвит уже созданный граф провайдеров.
  const sessionSecret = app.get<string>(SESSION_SECRET);
  const isRawImageUpload = makeIsRawImageUpload(sessionSecret);
  const isMaterialFileUpload = makeIsMaterialFileUpload(sessionSecret);
  const isExamVideoUpload = makeIsExamVideoUpload(sessionSecret);
  const isAnswerVideoPart = makeIsAnswerVideoPart(sessionSecret);

  // Мера 2 (SECURITY §4, ADR-0083) — потолок на число сырых загрузок
  // «в полёте» одновременно, ДО всех трёх парсеров ниже: иначе тело уже
  // легло бы в память к моменту отказа. Один счётчик на все три маршрута —
  // общий бюджет памяти инстанса, не по маршруту. 4 × 50 МБ (видео,
  // ADR-0133, крупнее файла материала) = 200 МБ худший случай
  // (raw-upload-concurrency.ts, RAW_UPLOAD_CONCURRENCY_LIMIT).
  app.use(
    makeRawUploadConcurrencyLimit(
      (req) =>
        isRawImageUpload(req) || isMaterialFileUpload(req) || isExamVideoUpload(req),
    ),
  );
  // Сырое тело — исключение из «файлы мимо API» (SECURITY §4) ровно на три
  // маршрута: картинки вариантов ответа (ADR-0035), снимок перевода
  // (ADR-0050) и видео вопроса/варианта (ADR-0133). Включается по предикату
  // маршрута, заявленного типа и подписанной сессии (exam-image-body.ts, там
  // же список маршрутов картинок), а не по image/* глобально — иначе такое
  // тело в любом другом запросе стало бы Buffer, и ValidationPipe
  // (whitelist/forbidNonWhitelisted) перебирал бы его как «лишние поля».
  app.useBodyParser('raw', {
    type: isRawImageUpload,
    limit: EXAM_IMAGE_LIMITS.maxBytes,
  });
  // Файл материала — свой маршрут, свой список типов и свой потолок, втрое
  // больше картинки варианта (ADR-0057). Один парсер с общим лимитом пустил
  // бы тридцатимегабайтную картинку в Mongo.
  app.useBodyParser('raw', {
    type: isMaterialFileUpload,
    limit: MATERIAL_FILE_LIMITS.maxBytes,
  });
  // Третий раз (ADR-0133): видео вопроса/варианта — свой маршрут, свой
  // список типов и самый большой потолок из трёх — байты идут в R2, не в
  // Mongo, но всё равно проходят через память инстанса на загрузке.
  app.useBodyParser('raw', {
    type: isExamVideoUpload,
    limit: EXAM_VIDEO_LIMITS.maxBytes,
  });
  // Четвёртый и последний (ADR-0137): часть видео-ответа — свой предикат,
  // свой лимит (8 МиБ, кусок, не файл целиком) и СВОЙ счётчик
  // одновременности (ANSWER_VIDEO_PART_CONCURRENCY_LIMIT) — общий с первыми
  // тремя маршрутами он оказался бы либо слишком тесным для частых мелких
  // частей, либо занижал бы их бюджет памяти относительно редких крупных
  // файлов.
  app.use(
    makeRawUploadConcurrencyLimit(isAnswerVideoPart, ANSWER_VIDEO_PART_CONCURRENCY_LIMIT),
  );
  app.useBodyParser('raw', {
    type: isAnswerVideoPart,
    limit: ANSWER_VIDEO_LIMITS.partBytes,
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
