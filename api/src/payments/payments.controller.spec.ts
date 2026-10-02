// Test.createTestingModule с фейком сервиса — образец broadcasts.controller.spec.ts:
// без HTTP, без Mongo. Роль accountant/admin и 403 учителю/помощнику
// проверяет e2e (payments-ownership.e2e-spec.ts) на настоящем гварде —
// здесь только «контроллер зовёт сервис с правильными аргументами».
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import type { PaymentDto, PaymentsPageDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { PaymentScreenshotsService } from './payment-screenshots.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

const ACCOUNTANT: UserLean = {
  id: 'u1',
  name: 'Бухгалтер',
  roles: ['accountant'],
  status: 'active',
  studentMode: false,
};

const PAYMENT_DTO: PaymentDto = {
  userId: 's1',
  userName: 'Ученик',
  month: '2026-09',
  status: 'paid',
};

const PAGE_DTO: PaymentsPageDto = { month: '2026-09', rows: [PAYMENT_DTO] };

async function buildController(
  service: Partial<PaymentsService> = {},
  screenshots: Partial<PaymentScreenshotsService> = {},
): Promise<PaymentsController> {
  const module = await Test.createTestingModule({
    controllers: [PaymentsController],
    providers: [
      { provide: PaymentsService, useValue: service },
      { provide: PaymentScreenshotsService, useValue: screenshots },
    ],
  }).compile();
  return module.get(PaymentsController);
}

describe('PaymentsController', () => {
  it('screenshot() отдаёт байты с типом и no-store; заголовок ставит после удачного чтения', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff]);
    const load = jest.fn().mockResolvedValue({ bytes, contentType: 'image/jpeg' });
    const controller = await buildController({}, { load });
    const setHeader = jest.fn();

    const file = await controller.screenshot('s1', '2026-09', { setHeader });

    expect(load).toHaveBeenCalledWith('s1', '2026-09');
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(file.getHeaders()).toMatchObject({ type: 'image/jpeg', length: 3 });
  });

  it('screenshot(): сервис отказал — no-store не ставится, ошибка идёт наверх', async () => {
    const load = jest.fn().mockRejectedValue(new Error('нет снимка'));
    const controller = await buildController({}, { load });
    const setHeader = jest.fn();

    await expect(controller.screenshot('s1', '2026-09', { setHeader })).rejects.toThrow(
      'нет снимка',
    );
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('list() передаёт query и now в сервис', async () => {
    const listMonth = jest.fn().mockResolvedValue(PAGE_DTO);
    const controller = await buildController({ listMonth });
    const query = { month: '2026-09' };

    await expect(controller.list(query)).resolves.toEqual(PAGE_DTO);
    expect(listMonth).toHaveBeenCalledWith(query, expect.any(DateTime));
  });

  it('confirm() передаёт userId/month из пути, тело и id бухгалтера из сессии — не из тела', async () => {
    const confirm = jest.fn().mockResolvedValue(PAYMENT_DTO);
    const controller = await buildController({ confirm });
    const body = { amountMinor: 25000 };

    await expect(controller.confirm('s1', '2026-09', body, ACCOUNTANT)).resolves.toEqual(
      PAYMENT_DTO,
    );
    expect(confirm).toHaveBeenCalledWith(
      's1',
      '2026-09',
      body,
      ACCOUNTANT.id,
      expect.any(DateTime),
    );
  });

  it('revoke() передаёт userId/month из пути в сервис', async () => {
    const revoke = jest.fn().mockResolvedValue(PAYMENT_DTO);
    const controller = await buildController({ revoke });

    await expect(controller.revoke('s1', '2026-09')).resolves.toEqual(PAYMENT_DTO);
    expect(revoke).toHaveBeenCalledWith('s1', '2026-09');
  });
});
