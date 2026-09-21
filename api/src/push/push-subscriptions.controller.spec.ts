// Test.createTestingModule с фейком сервиса — образец notification-prefs.controller.spec.ts:
// без HTTP, без Mongo. Владение и «нет секретов в ответе» проверяет e2e
// (push-subscriptions.e2e-spec.ts) на настоящем гварде — здесь только
// «контроллер зовёт сервис с userId из сессии и телом запроса».
import { Test } from '@nestjs/testing';
import type { PushSubscriptionDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import { UnsubscribePushDto } from './dto/unsubscribe-push.dto';
import { PushSubscriptionsController } from './push-subscriptions.controller';
import { PushSubscriptionsService } from './push-subscriptions.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
};

const SUBSCRIBE_BODY: SubscribePushDto = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
  p256dh: 'p256dh-value',
  auth: 'auth-value',
};

const SUBSCRIPTION_DTO: PushSubscriptionDto = {
  id: 's1',
  endpoint: SUBSCRIBE_BODY.endpoint,
  createdAt: '2026-09-21T10:00:00.000Z',
  updatedAt: '2026-09-21T10:00:00.000Z',
};

async function buildController(
  service: Partial<PushSubscriptionsService> = {},
): Promise<PushSubscriptionsController> {
  const module = await Test.createTestingModule({
    controllers: [PushSubscriptionsController],
    providers: [{ provide: PushSubscriptionsService, useValue: service }],
  }).compile();
  return module.get(PushSubscriptionsController);
}

describe('PushSubscriptionsController', () => {
  it('subscribe() передаёт userId из сессии и тело запроса в сервис', async () => {
    const subscribe = jest.fn().mockResolvedValue(SUBSCRIPTION_DTO);
    const controller = await buildController({ subscribe });

    await expect(controller.subscribe(SUBSCRIBE_BODY, USER)).resolves.toEqual(
      SUBSCRIPTION_DTO,
    );
    expect(subscribe).toHaveBeenCalledWith(USER.id, SUBSCRIBE_BODY);
  });

  it('unsubscribe() передаёт userId из сессии и endpoint из тела', async () => {
    const unsubscribe = jest.fn().mockResolvedValue(undefined);
    const controller = await buildController({ unsubscribe });
    const body: UnsubscribePushDto = { endpoint: SUBSCRIBE_BODY.endpoint };

    await controller.unsubscribe(body, USER);

    expect(unsubscribe).toHaveBeenCalledWith(USER.id, body.endpoint);
  });
});
