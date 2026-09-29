// GET /me/payments глазами ученика — «что у меня за этот месяц» одной строкой
// в e2e оплат. Ответ — страница `{ month, rows }` (слой 2.4), и без хелпера
// каждое место повторяло запрос, статус и разбор `.rows` заново.
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { MyPaymentDto, MyPaymentsPageDto } from '@xuanxue/shared';

export async function myPaymentsPage(
  app: NestExpressApplication,
  cookie: string,
): Promise<MyPaymentsPageDto> {
  const res = await request(app.getHttpServer())
    .get('/api/me/payments')
    .set('Cookie', cookie);
  expect(res.status).toBe(200);
  return res.body as MyPaymentsPageDto;
}

/** Строки ученика за один месяц — массив, а не первая найденная: тест
 * «повтор не заводит второй абонемент» считает именно их число. */
export async function myPaymentRowsFor(
  app: NestExpressApplication,
  cookie: string,
  month: string,
): Promise<MyPaymentDto[]> {
  const page = await myPaymentsPage(app, cookie);
  return page.rows.filter((row) => row.month === month);
}
