// Чистая логика декоратора — без Mongo и без HTTP (CLAUDE.md «Тесты»).
// Фабрику параметрического декоратора Nest достаёт из метаданных маршрута:
// снаружи её иначе не позвать, а проверять есть что — @CurrentUser() на
// маршруте без AuthGuard обязан падать заметно, а не отдавать undefined
// дальше в сервис (auth.decorators.ts).
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { ExecutionContext } from '@nestjs/common';
import type { UserLean } from '../users/users.service';
import type { RequestLike } from '../common/http-headers';
import { CurrentUser } from './auth.decorators';

type ParamFactory = (data: unknown, ctx: ExecutionContext) => UserLean;

function currentUserFactory(): ParamFactory {
  class Probe {
    handler(@CurrentUser() _user: UserLean): void {}
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handler') as Record<
    string,
    { factory: ParamFactory }
  >;
  const [first] = Object.values(args);
  if (!first) throw new Error('setup: метаданные параметра не собрались');
  return first.factory;
}

function contextWith(request: Partial<RequestLike>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('@CurrentUser', () => {
  const user = { id: 'u1', name: 'Ученик', roles: [] } as unknown as UserLean;

  it('сессия разобрана гвардом — отдаёт пользователя из запроса', () => {
    expect(currentUserFactory()(undefined, contextWith({ user }))).toBe(user);
  });

  it('маршрут без AuthGuard — падает с понятной причиной, а не отдаёт пустоту', () => {
    expect(() => currentUserFactory()(undefined, contextWith({}))).toThrow(
      'без AuthGuard',
    );
  });
});
