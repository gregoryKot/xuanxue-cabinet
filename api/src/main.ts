import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

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

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

void bootstrap();
