// Проверка тела PUT /me/payments/reminder-day (ADR-0161) без HTTP: 1–31 и null
// проходят, всё остальное — нет. Сквозную проверку с кодом 400 держит e2e
// (api/test/payment-reminder-day.e2e-spec.ts).
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetPaymentReminderDayDto } from './set-payment-reminder-day.dto';

async function errorsFor(body: unknown): Promise<number> {
  const errors = await validate(plainToInstance(SetPaymentReminderDayDto, body));
  return errors.length;
}

describe('SetPaymentReminderDayDto', () => {
  it.each([1, 15, 31])('день %i принимается', async (dayOfMonth) => {
    expect(await errorsFor({ dayOfMonth })).toBe(0);
  });

  it('null принимается — «как у школы»', async () => {
    expect(await errorsFor({ dayOfMonth: null })).toBe(0);
  });

  it.each([0, 32, -1, 1.5, '5', true, [], {}])(
    'значение %p отклоняется',
    async (dayOfMonth) => {
      expect(await errorsFor({ dayOfMonth })).toBeGreaterThan(0);
    },
  );

  it('поля нет — отклоняется, а не молча сбрасывает выбор', async () => {
    expect(await errorsFor({})).toBeGreaterThan(0);
  });
});
