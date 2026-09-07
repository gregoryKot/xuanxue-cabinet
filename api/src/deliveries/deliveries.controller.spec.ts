// Test.createTestingModule с фейком сервиса — образец lessons.controller.spec.ts:
// без HTTP, без Mongo. Роли/CSRF/404 проверяет e2e (deliveries.e2e-spec.ts).
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import type { DeliveryDto } from '@xuanxue/shared';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';

const DELIVERY_DTO: DeliveryDto = {
  id: 'd1',
  broadcastId: 'b1',
  channelId: 'c1',
  status: 'manual',
  attempts: 0,
};

async function buildController(
  service: Partial<DeliveriesService> = {},
): Promise<DeliveriesController> {
  const module = await Test.createTestingModule({
    controllers: [DeliveriesController],
    providers: [{ provide: DeliveriesService, useValue: service }],
  }).compile();
  return module.get(DeliveriesController);
}

describe('DeliveriesController', () => {
  it('getById() передаёт id в сервис', async () => {
    const getById = jest.fn().mockResolvedValue(DELIVERY_DTO);
    const controller = await buildController({ getById });

    await expect(controller.getById('d1')).resolves.toEqual(DELIVERY_DTO);
    expect(getById).toHaveBeenCalledWith('d1');
  });

  it('markSent() передаёт id и now в сервис', async () => {
    const markSent = jest.fn().mockResolvedValue({ ...DELIVERY_DTO, status: 'sent' });
    const controller = await buildController({ markSent });

    await expect(controller.markSent('d1')).resolves.toEqual({
      ...DELIVERY_DTO,
      status: 'sent',
    });
    // `now` — DateTime.utc() контроллера, конкретный момент проверен в
    // deliveries.service.spec.ts.
    expect(markSent).toHaveBeenCalledWith('d1', expect.any(DateTime));
  });
});
