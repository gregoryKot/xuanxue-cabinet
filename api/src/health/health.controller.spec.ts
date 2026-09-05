import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { HealthController } from './health.controller';
import pkg from '../../package.json';

async function buildController(readyState: number): Promise<HealthController> {
  const module = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: getConnectionToken(), useValue: { readyState } }],
  }).compile();
  return module.get(HealthController);
}

describe('HealthController', () => {
  it('mongo: up, когда readyState соединения === 1', async () => {
    const controller = await buildController(1);
    expect(controller.check()).toMatchObject({ status: 'ok', mongo: 'up' });
  });

  it('mongo: down, когда соединение не готово', async () => {
    const controller = await buildController(0);
    expect(controller.check()).toMatchObject({ status: 'ok', mongo: 'down' });
  });

  it('версия берётся из package.json', async () => {
    const controller = await buildController(1);
    expect(controller.check().version).toBe(pkg.version);
  });

  it('uptimeSec — неотрицательное целое число', async () => {
    const controller = await buildController(1);
    const { uptimeSec } = controller.check();
    expect(Number.isInteger(uptimeSec)).toBe(true);
    expect(uptimeSec).toBeGreaterThanOrEqual(0);
  });
});
