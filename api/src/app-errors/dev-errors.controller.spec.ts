// Тонкий контроллер — отдаёт query сервису вместе с текущим моментом
// (CLAUDE.md «Логика вне контроллеров»); что сервис делает с фильтром и
// лимитом — app-errors.service.spec.ts. Образец —
// client-errors.controller.spec.ts.
import { DateTime } from 'luxon';
import type { AppErrorListDto, ListAppErrorsQuery } from '@xuanxue/shared';
import { DevErrorsController } from './dev-errors.controller';
import type { AppErrorsService } from './app-errors.service';

function buildController(): {
  controller: DevErrorsController;
  list: jest.Mock<Promise<AppErrorListDto>, [ListAppErrorsQuery, DateTime]>;
} {
  const list = jest.fn<Promise<AppErrorListDto>, [ListAppErrorsQuery, DateTime]>();
  list.mockResolvedValue({ items: [], last24h: 0 });
  const controller = new DevErrorsController({ list } as unknown as AppErrorsService);
  return { controller, list };
}

describe('DevErrorsController', () => {
  it('отдаёт query сервису вместе с текущим моментом (DateTime)', async () => {
    const { controller, list } = buildController();
    const query: ListAppErrorsQuery = { source: 'server', kind: 'server', limit: 10 };

    await controller.list(query);

    expect(list).toHaveBeenCalledTimes(1);
    const [passedQuery, now] = list.mock.calls[0] as [ListAppErrorsQuery, DateTime];
    expect(passedQuery).toBe(query);
    expect(now).toBeInstanceOf(DateTime);
  });

  it('возвращает то, что вернул сервис', async () => {
    const { controller, list } = buildController();
    const result: AppErrorListDto = {
      items: [
        {
          id: '1',
          source: 'server',
          kind: 'server',
          path: '/api/x',
          text: 'boom',
          occurredAt: '2026-09-27T12:00:00.000Z',
        },
      ],
      last24h: 1,
    };
    list.mockResolvedValue(result);

    expect(await controller.list({})).toEqual(result);
  });
});
