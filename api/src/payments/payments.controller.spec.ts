// Test.createTestingModule с фейком сервиса — образец broadcasts.controller.spec.ts:
// без HTTP, без Mongo. Роль accountant/admin и 403 учителю/помощнику
// проверяет e2e (payments-ownership.e2e-spec.ts) на настоящем гварде —
// здесь только «контроллер зовёт сервис с правильными аргументами».
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import type { PaymentDto, PaymentsPageDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

const ACCOUNTANT: UserLean = {
  id: 'u1',
  name: 'Бухгалтер',
  roles: ['accountant'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

const PAYMENT_DTO: PaymentDto = {
  userId: 's1',
  userName: 'Ученик',
  month: '2026-09',
  status: 'paid',
  hasScreenshot: false,
};

const PAGE_DTO: PaymentsPageDto = { month: '2026-09', rows: [PAYMENT_DTO] };

async function buildController(
  service: Partial<PaymentsService> = {},
): Promise<PaymentsController> {
  const module = await Test.createTestingModule({
    controllers: [PaymentsController],
    providers: [{ provide: PaymentsService, useValue: service }],
  }).compile();
  return module.get(PaymentsController);
}

describe('PaymentsController', () => {
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
