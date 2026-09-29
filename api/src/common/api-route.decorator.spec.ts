// Сверка карты маршрутов с Nest — на фикстурах, без приложения: какие
// расхождения findApiRouteProblems называет и какие пропускает. Сама
// сверка с настоящим AppModule — api/test/api-routes.e2e-spec.ts.
import type { InboxPageDto } from '@xuanxue/shared';
import {
  API_ROUTE_METADATA,
  ApiRoute,
  findApiRouteProblems,
} from './api-route.decorator';

const KEYS = ['GET /me/inbox', 'DELETE /me/inbox/:id'];

describe('findApiRouteProblems', () => {
  it('всё сходится — пусто, обработчик вне карты без @ApiRoute не мешает', () => {
    expect(
      findApiRouteProblems(
        [
          { handler: 'Inbox.list', route: 'GET /me/inbox', declared: 'GET /me/inbox' },
          {
            handler: 'Inbox.dismiss',
            route: 'DELETE /me/inbox/:id',
            declared: 'DELETE /me/inbox/:id',
          },
          { handler: 'Health.get', route: 'GET /health' },
        ],
        KEYS,
      ),
    ).toEqual([]);
  });

  it('ключ карты без обработчика — ошибка', () => {
    expect(
      findApiRouteProblems(
        [{ handler: 'Inbox.list', route: 'GET /me/inbox', declared: 'GET /me/inbox' }],
        KEYS,
      ),
    ).toEqual(['DELETE /me/inbox/:id: в карте есть, обработчика в Nest нет']);
  });

  it('@ApiRoute с ключом, который не совпал с маршрутом Nest, — ошибка', () => {
    const problems = findApiRouteProblems(
      [
        { handler: 'Inbox.list', route: 'GET /me/inbox', declared: 'GET /me/inbox' },
        {
          handler: 'Inbox.dismiss',
          route: 'DELETE /me/inbox/:itemId',
          declared: 'DELETE /me/inbox/:id',
        },
      ],
      KEYS,
    );

    expect(problems).toEqual([
      "Inbox.dismiss: @ApiRoute('DELETE /me/inbox/:id'), а Nest регистрирует DELETE /me/inbox/:itemId",
      'DELETE /me/inbox/:id: в карте есть, обработчика в Nest нет',
    ]);
  });

  it('маршрут из карты без @ApiRoute — ошибка: типы ответа не проверены', () => {
    expect(
      findApiRouteProblems(
        [{ handler: 'Inbox.list', route: 'GET /me/inbox' }],
        ['GET /me/inbox'],
      ),
    ).toEqual(["Inbox.list: обслуживает GET /me/inbox без @ApiRoute('GET /me/inbox')"]);
  });
});

describe('@ApiRoute', () => {
  it('кладёт ключ в метаданные обработчика', () => {
    class Controller {
      @ApiRoute('GET /me/inbox')
      list(): Promise<InboxPageDto> {
        return Promise.resolve({ items: [], unreadCount: 0 });
      }
    }

    const handler: unknown = Object.getOwnPropertyDescriptor(
      Controller.prototype,
      'list',
    )?.value;

    expect(Reflect.getMetadata(API_ROUTE_METADATA, handler as object)).toBe(
      'GET /me/inbox',
    );
  });
});
