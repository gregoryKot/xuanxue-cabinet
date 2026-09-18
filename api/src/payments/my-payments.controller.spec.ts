// Test.createTestingModule с фейком сервиса — образец notification-prefs.controller.spec.ts:
// без HTTP, без Mongo. Владение по сессии (не по query/пути) проверяет e2e
// (payments-ownership.e2e-spec.ts) на настоящем гварде — здесь только
// «контроллер берёт userId из @CurrentUser(), а не откуда-то ещё».
import { Test } from '@nestjs/testing';
import type { MyPaymentDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { MyPaymentsController } from './my-payments.controller';
import { PaymentsService } from './payments.service';

const STUDENT: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

const MY_PAYMENTS: MyPaymentDto[] = [
  { month: '2026-09', status: 'paid', hasScreenshot: false },
];

async function buildController(
  service: Partial<PaymentsService> = {},
): Promise<MyPaymentsController> {
  const module = await Test.createTestingModule({
    controllers: [MyPaymentsController],
    providers: [{ provide: PaymentsService, useValue: service }],
  }).compile();
  return module.get(MyPaymentsController);
}

describe('MyPaymentsController', () => {
  it('list() зовёт сервис с userId из сессии, не из query', async () => {
    const listMine = jest.fn().mockResolvedValue(MY_PAYMENTS);
    const controller = await buildController({ listMine });

    await expect(controller.list(STUDENT)).resolves.toEqual(MY_PAYMENTS);
    expect(listMine).toHaveBeenCalledWith(STUDENT.id);
  });
});
