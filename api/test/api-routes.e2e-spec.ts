// Сверка карты маршрутов (shared/src/api-routes.ts) с маршрутами настоящего
// AppModule (PLAN §17.1, ADR-0148). `tsc` держит типы по обе стороны шва, но
// не знает, что обработчик с `@ApiRoute(ключ)` вообще подключён и висит на
// том же пути: запись в карте без обработчика — ровно «Cannot GET
// /api/materials/:id» 2026-09-27, только пойманный до прода.
import { findApiRouteProblems } from '../src/common/api-route.decorator';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { collectRegisteredRoutes } from './e2e-support/registered-routes';

describe('Карта маршрутов ↔ Nest (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('сборщик видит маршруты приложения — пустой список не выдаётся за зелёный', () => {
    const routes = collectRegisteredRoutes(testApp.app).map((entry) => entry.route);

    expect(routes).toContain('GET /health');
    expect(routes).toContain('POST /me/inbox/:id/read');
  });

  it('у каждого ключа карты есть обработчик с @ApiRoute на том же маршруте', () => {
    expect(findApiRouteProblems(collectRegisteredRoutes(testApp.app))).toEqual([]);
  });
});
