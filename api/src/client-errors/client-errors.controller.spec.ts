// Тонкий контроллер — достаёт код обращения из запроса и отдаёт тело сервису
// (CLAUDE.md «Логика вне контроллеров»). Публичность, троттлинг, CSRF и отказы
// валидации — client-errors.e2e-spec.ts; что сервис делает с отчётом —
// client-errors.service.spec.ts.
import type { ReportClientErrorInput } from '@xuanxue/shared';
import { ClientErrorsController } from './client-errors.controller';
import type { ClientErrorsService } from './client-errors.service';

function buildController(): {
  controller: ClientErrorsController;
  report: jest.Mock<void, [ReportClientErrorInput, string | undefined]>;
} {
  const report = jest.fn<void, [ReportClientErrorInput, string | undefined]>();
  const controller = new ClientErrorsController({
    report,
  } as unknown as ClientErrorsService);
  return { controller, report };
}

const BODY: ReportClientErrorInput = {
  kind: 'render',
  message: 'TypeError: x is undefined',
  path: '/exams',
};

describe('ClientErrorsController', () => {
  it('отдаёт тело сервису вместе с кодом обращения из запроса', () => {
    const { controller, report } = buildController();

    controller.report(BODY, { id: 'req-1' });

    expect(report).toHaveBeenCalledWith(BODY, 'req-1');
  });

  // Код обращения пишет pino-http (logging.module.ts) и он есть всегда, но
  // контроллер не имеет права выдумать строку «undefined» вместо него, если
  // однажды не будет: по такому «коду» в логах Railway ничего не найдётся.
  it('нет кода обращения — сервис получает undefined, не строку', () => {
    const { controller, report } = buildController();

    controller.report(BODY, {});

    expect(report).toHaveBeenCalledWith(BODY, undefined);
  });
});
