// Test.createTestingModule с фейком сервиса — образец notification-prefs.controller.spec.ts:
// без HTTP, без Mongo. Владение по сессии (не по query/пути) проверяет e2e
// (payments-ownership.e2e-spec.ts) на настоящем гварде — здесь только
// «контроллер берёт userId из @CurrentUser(), а не откуда-то ещё».
import { Test } from '@nestjs/testing';
import type { MyPaymentDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { MyPaymentsController } from './my-payments.controller';
import { PaymentScreenshotsService } from './payment-screenshots.service';
import { PaymentsService } from './payments.service';

const STUDENT: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
};

const MY_PAYMENTS: MyPaymentDto[] = [
  { month: '2026-09', status: 'paid', hasScreenshot: false },
];

async function buildController(
  service: Partial<PaymentsService> = {},
  screenshots: Partial<PaymentScreenshotsService> = {},
): Promise<MyPaymentsController> {
  const module = await Test.createTestingModule({
    controllers: [MyPaymentsController],
    providers: [
      { provide: PaymentsService, useValue: service },
      { provide: PaymentScreenshotsService, useValue: screenshots },
    ],
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

  it('uploadScreenshot() берёт владельца из сессии, а тело — сырым из запроса', async () => {
    const upload = jest.fn().mockResolvedValue(MY_PAYMENTS[0]);
    const controller = await buildController({}, { upload });
    const bytes = Buffer.from([0xff, 0xd8, 0xff]);

    await expect(
      controller.uploadScreenshot('2026-09', { body: bytes }, STUDENT),
    ).resolves.toEqual(MY_PAYMENTS[0]);

    const [passedBody, passedUserId, passedMonth] = upload.mock.calls[0] as unknown[];
    expect(passedBody).toBe(bytes);
    expect(passedUserId).toBe(STUDENT.id);
    expect(passedMonth).toBe('2026-09');
  });
});
