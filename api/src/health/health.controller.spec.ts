import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { HealthController } from './health.controller';
import pkg from '../../package.json';

// Фейк вместо ResponseLike (common/http-headers.ts): контроллеру здоровья
// нужен только status(), а не весь набор для cookie — см. HealthResponseLike
// в health.controller.ts.
function fakeStatusResponse(): { status: jest.Mock; code: number | undefined } {
  const state: { status: jest.Mock; code: number | undefined } = {
    status: jest.fn(),
    code: undefined,
  };
  state.status.mockImplementation((code: number) => {
    state.code = code;
  });
  return state;
}

async function buildController(
  readyState: number,
  railwayCommitSha?: string,
): Promise<HealthController> {
  const module = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: getConnectionToken(), useValue: { readyState } },
      {
        provide: ConfigService,
        useValue: { get: () => railwayCommitSha },
      },
    ],
  }).compile();
  return module.get(HealthController);
}

describe('HealthController', () => {
  it('mongo: up, readyState === 1 — status ok, код 200', async () => {
    const controller = await buildController(1);
    const res = fakeStatusResponse();
    expect(controller.check(res)).toMatchObject({ status: 'ok', mongo: 'up' });
    expect(res.code).toBe(200);
  });

  it('mongo: down, соединение не готово — status degraded, код 503', async () => {
    const controller = await buildController(0);
    const res = fakeStatusResponse();
    expect(controller.check(res)).toMatchObject({ status: 'degraded', mongo: 'down' });
    expect(res.code).toBe(503);
  });

  it('версия берётся из package.json', async () => {
    const controller = await buildController(1);
    expect(controller.check(fakeStatusResponse()).version).toBe(pkg.version);
  });

  it('uptimeSec — неотрицательное целое число', async () => {
    const controller = await buildController(1);
    const { uptimeSec } = controller.check(fakeStatusResponse());
    expect(Number.isInteger(uptimeSec)).toBe(true);
    expect(uptimeSec).toBeGreaterThanOrEqual(0);
  });

  it('RAILWAY_GIT_COMMIT_SHA задан — commit: первые 7 символов', async () => {
    const controller = await buildController(1, 'a1b2c3d4e5f6789');
    expect(controller.check(fakeStatusResponse()).commit).toBe('a1b2c3d');
  });

  it('RAILWAY_GIT_COMMIT_SHA не задан (локальный запуск) — commit undefined', async () => {
    // JSON.stringify выкидывает ключ со значением undefined из тела ответа
    // (её и видит клиент) — здесь проверяется значение до сериализации,
    // «поле отсутствует в HTTP-ответе» — health.e2e-spec.ts.
    const controller = await buildController(1);
    expect(controller.check(fakeStatusResponse()).commit).toBeUndefined();
  });
});
