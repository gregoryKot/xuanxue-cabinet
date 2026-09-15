// Фейковый BotUserAccessService для спеков хендлеров бота — тот же приём,
// что exam-bot.port.test-support.ts/bot-session.service.test-support.ts:
// один резолвер вместо стаба UsersService в каждом спеке отдельно
// (CLAUDE.md «Одна механика — один компонент»).
import type { UserLean } from '../users/users.service';
import type { BotUserAccess, BotUserAccessService } from './bot-user-access.service';

export function fakeBotUserAccess(access: BotUserAccess): BotUserAccessService {
  return {
    resolve: jest.fn().mockResolvedValue(access),
  } as unknown as BotUserAccessService;
}

export function activeAccess(user: UserLean): BotUserAccess {
  return { kind: 'active', user };
}
