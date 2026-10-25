// Без HTTP-стека: что маршрут проверки сессии помечен для продления одной
// cookie и что no-store вешается на GET auth/session до гвардов. Ответы
// целиком — e2e session-check.
import { RequestMethod, type MiddlewareConsumer } from '@nestjs/common';
import { fakeResponse } from '../test-support/http-fakes';
import { RENEW_ACTIVE_COOKIE_ONLY_KEY } from './auth.decorators';
import { AuthModule } from './auth.module';
import { SessionCheckController, setNoStoreMiddleware } from './session-check.controller';

describe('setNoStoreMiddleware', () => {
  it('ставит Cache-Control: no-store и пропускает запрос дальше', () => {
    const res = fakeResponse();
    const next = jest.fn();
    setNoStoreMiddleware({}, res, next);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('SessionCheckController', () => {
  it('обработчик без тела и с меткой продления одной cookie', () => {
    const controller = new SessionCheckController();
    expect(controller.check()).toBeUndefined();
    // Дескриптор вместо `prototype.check` — метод не отвязывается (unbound-method).
    const handler: unknown = Object.getOwnPropertyDescriptor(
      SessionCheckController.prototype,
      'check',
    )?.value;
    expect(Reflect.getMetadata(RENEW_ACTIVE_COOKIE_ONLY_KEY, handler as object)).toBe(
      true,
    );
  });
});

describe('AuthModule.configure', () => {
  it('no-store — только на GET auth/session', () => {
    const forRoutes = jest.fn();
    const apply = jest.fn(() => ({ forRoutes }));
    new AuthModule().configure({ apply } as unknown as MiddlewareConsumer);
    expect(apply).toHaveBeenCalledWith(setNoStoreMiddleware);
    expect(forRoutes).toHaveBeenCalledWith({
      path: 'auth/session',
      method: RequestMethod.GET,
    });
  });
});
