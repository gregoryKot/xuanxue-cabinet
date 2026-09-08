// Test.createTestingModule с фейком сервиса — образец broadcasts.controller.spec.ts:
// без HTTP, без Mongo. Роли/CSRF проверяет e2e (summary.e2e-spec.ts).
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import type { SummaryDto } from '@xuanxue/shared';
import { SummaryController } from './summary.controller';
import { SummaryService } from './summary.service';

const SUMMARY_DTO: SummaryDto = {
  period: { from: '2026-08-07T18:00:00.000Z', to: '2026-09-06T18:00:00.000Z' },
  broadcastsSent: 1,
  broadcastsCancelled: 0,
  deliveriesFailed: 0,
  deliveriesPending: 0,
  manualWaiting: 0,
};

async function buildController(
  service: Partial<SummaryService> = {},
): Promise<SummaryController> {
  const module = await Test.createTestingModule({
    controllers: [SummaryController],
    providers: [{ provide: SummaryService, useValue: service }],
  }).compile();
  return module.get(SummaryController);
}

describe('SummaryController', () => {
  it('get() зовёт сервис с now', async () => {
    const get = jest.fn().mockResolvedValue(SUMMARY_DTO);
    const controller = await buildController({ get });

    await expect(controller.get()).resolves.toEqual(SUMMARY_DTO);
    // Конкретный момент (SUMMARY_PERIOD_DAYS от now) проверен в
    // summary.service.spec.ts — здесь только факт вызова.
    expect(get).toHaveBeenCalledWith(expect.any(DateTime));
  });
});
