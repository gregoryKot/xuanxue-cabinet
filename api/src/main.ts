import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { errorMessage, errorStack } from './common/error-info';
import { applyHttpServerTimeouts } from './common/http-server-timeouts';
import { installProcessGuards } from './common/process-guards';
import { RENAMED_RESERVED_LOG_KEY } from './logging/logging.module';

async function bootstrap(): Promise<void> {
  // ExpressAdapter передаётся явно, а не автоопределяется NestFactory: в этом
  // npm-workspace @nestjs/platform-express лежит в api/node_modules, а
  // @nestjs/core (и его автозагрузчик адаптера) — в корневом node_modules.
  // require() из core/helpers/load-adapter.js не видит вложенный api/node_modules
  // и роняет процесс («No driver (HTTP) has been selected»). Явный адаптер
  // резолвится require()'ом из ЭТОГО файла (внутри api/), поэтому находится.
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
    {
      // bufferLogs: логи до useLogger() не теряются (пишутся, когда логгер подключится).
      bufferLogs: true,
      // Свой лимит тела запроса (см. app.setup.ts) вместо дефолтного парсера Nest.
      bodyParser: false,
    },
  );
  configureApp(app);

  // Устойчивость процесса (аудит 2026-09-21, HIGH): без гвардов один
  // необработанный reject в Node 22 валит единственный инстанс молча —
  // process-guards.ts, лог и разбор строки — RUNBOOK §4.
  installProcessGuards(process, app.get(Logger), () => process.exit(1));

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3000;
  // Keep-alive длиннее, чем у прокси Railway (http-server-timeouts.ts,
  // аудит 2026-10-01) — до listen(), чтобы первое же соединение жило по
  // новым правилам.
  applyHttpServerTimeouts(app.getHttpServer());
  await app.listen(port);
}

// bootstrap() может упасть до того, как nestjs-pino Logger поднят (сбой в
// NestFactory.create/configureApp) — писать через Logger в этот момент
// некуда. `void bootstrap()` эту ошибку раньше глотал молча (аудит
// 2026-09-21, HIGH) — теперь .catch() пишет JSON-строку уровня error
// напрямую в stderr в том же виде, что и логгер (уровень словом, текст
// ошибки не в зарезервированном `message` — logging.module.ts), и завершает процесс: `console.*` в api/src запрещён eslint, а
// process.exitCode = 1 (приём seed-скриптов) тут не годится — без
// прослушанного порта процесс всё равно не живой, нужен настоящий exit.
bootstrap().catch((error: unknown) => {
  const line = {
    level: 'error',
    msg: 'bootstrap failed',
    [RENAMED_RESERVED_LOG_KEY]: errorMessage(error),
    stack: errorStack(error),
  };
  process.stderr.write(`${JSON.stringify(line)}\n`);
  process.exit(1);
});
