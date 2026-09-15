// Кеш статики на настоящем express (CLAUDE.md «Тесты»: юнит-тест функции не
// доказывает, что @nestjs/serve-static вообще позовёт setHeaders — а без
// этого заголовков в ответе не будет).
//
// Корень раздачи — временный каталог с тремя файлами: web/dist в момент
// прогона e2e ещё не собран (npm run check строит web после e2e), да и
// содержимое настоящей сборки тесту не нужно.
//
// Приложение поднимается через NestFactory, а не Test.createTestingModule():
// ServeStaticModule выбирает загрузчик в момент создания провайдеров, и если
// http-адаптера ещё нет (а у скомпилированного TestingModule его нет до
// createNestApplication), достаётся NoopLoader — статика не раздаётся вовсе,
// и тест «проходил» бы мимо предмета проверки.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { ServeStaticModule } from '@nestjs/serve-static';
import request from 'supertest';
import {
  IMMUTABLE_CACHE_CONTROL,
  REVALIDATE_CACHE_CONTROL,
  staticAssetsOptions,
} from '../src/static/static-cache-control';

const DIST = mkdtempSync(join(tmpdir(), 'xuanxue-dist-'));
const INDEX_MARKER = 'Сюань-Сюэ';

@Module({ imports: [ServeStaticModule.forRoot(staticAssetsOptions(DIST))] })
class StaticOnlyModule {}

describe('Кеш статики (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    mkdirSync(join(DIST, 'assets'), { recursive: true });
    writeFileSync(join(DIST, 'assets', 'index-abc123.js'), 'export const a = 1;\n');
    writeFileSync(
      join(DIST, 'index.html'),
      `<!doctype html><title>${INDEX_MARKER}</title>`,
    );
    writeFileSync(join(DIST, 'sw.js'), '// service worker\n');

    // Явный ExpressAdapter — та же причина, что в main.ts и create-app.ts:
    // @nestjs/platform-express лежит в api/node_modules, автозагрузка
    // адаптера из @nestjs/core (корневой node_modules) его не находит.
    app = await NestFactory.create<NestExpressApplication>(
      StaticOnlyModule,
      new ExpressAdapter(),
      { logger: false },
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(DIST, { recursive: true, force: true });
  });

  function server(): ReturnType<NestExpressApplication['getHttpServer']> {
    return app.getHttpServer();
  }

  it('хэшированный файл из /assets/ — на год и immutable', async () => {
    const res = await request(server()).get('/assets/index-abc123.js');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe(IMMUTABLE_CACHE_CONTROL);
  });

  it('index.html и sw.js — no-cache, иначе килсвитч PWA залипает (ADR-0032)', async () => {
    const indexRes = await request(server()).get('/index.html');
    const swRes = await request(server()).get('/sw.js');

    expect(indexRes.headers['cache-control']).toBe(REVALIDATE_CACHE_CONTROL);
    expect(swRes.headers['cache-control']).toBe(REVALIDATE_CACHE_CONTROL);
  });

  // SPA-фолбэк идёт мимо express.static (@nestjs/serve-static сам зовёт
  // res.sendFile на renderPath) — без этой проверки любой адрес кабинета
  // («/planning», «/exams») уезжал бы с дефолтным `public, max-age=0`.
  it('любой адрес кабинета отдаёт index.html с no-cache', async () => {
    const res = await request(server()).get('/planning');

    expect(res.status).toBe(200);
    expect(res.text).toContain(INDEX_MARKER);
    expect(res.headers['cache-control']).toBe(REVALIDATE_CACHE_CONTROL);
  });
});
