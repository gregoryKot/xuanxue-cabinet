// Фейковый ExamBotPort и фейковый BotUserAccessService, без Mongo и без сети
// (CLAUDE.md «Тесты»): /exams, /экзамены — то же самое, что MyExamsService
// отдаёт кабинету (через порт), незнакомцу бот не отвечает, blocked —
// отказ вместо списка (SECURITY §9).
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { ACCESS_MESSAGE, type MyExamDto } from '@xuanxue/shared';
import type { UserLean } from '../../users/users.service';
import type { BotUserAccessService } from '../bot-user-access.service';
import { activeAccess, fakeBotUserAccess } from '../bot-user-access.service.test-support';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { ExamCommandHandler } from './exam-command.handler';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
};
const EXAM: MyExamDto = {
  id: 'e1',
  title: 'Форма',
  description: '',
  level: '',
  attemptsAllowed: 1,
  attemptsUsed: 0,
};

function stubExams(exams: MyExamDto[]) {
  const port = fakeExamBotPort({ listMyExams: jest.fn().mockResolvedValue(exams) });
  const registry = new ExamBotPortRegistry();
  registry.set(port);
  return { registry, listMyExams: port.listMyExams };
}

function fakeCtx(chatType: 'private' | 'group' = 'private'): {
  ctx: Context;
  replies: string[];
} {
  const replies: string[] = [];
  const ctx = {
    chat: { id: 111, type: chatType },
    reply: (text: string) => Promise.resolve(Boolean(replies.push(text))),
  } as unknown as Context;
  return { ctx, replies };
}

describe('ExamCommandHandler.handle', () => {
  it('известный человек — список экзаменов новым сообщением', async () => {
    const { registry, listMyExams } = stubExams([EXAM]);
    const handler = new ExamCommandHandler(
      fakeBotUserAccess(activeAccess(USER)),
      registry,
    );
    const { ctx, replies } = fakeCtx();

    await handler.handle(ctx, NOW);

    expect(listMyExams).toHaveBeenCalledWith(USER, NOW);
    expect(replies[0]).toContain('Форма');
  });

  it('незнакомец — бот молчит', async () => {
    const { registry } = stubExams([]);
    const handler = new ExamCommandHandler(
      fakeBotUserAccess({ kind: 'unknown' }),
      registry,
    );
    const { ctx, replies } = fakeCtx();

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([]);
  });

  it('заблокированный — отказ тем же текстом, что в вебе, список не запрашивается', async () => {
    const { registry, listMyExams } = stubExams([EXAM]);
    const handler = new ExamCommandHandler(
      fakeBotUserAccess({ kind: 'denied', message: ACCESS_MESSAGE }),
      registry,
    );
    const { ctx, replies } = fakeCtx();

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([ACCESS_MESSAGE]);
    expect(listMyExams).not.toHaveBeenCalled();
  });

  it('не личный чат — бот молчит', async () => {
    const { registry } = stubExams([EXAM]);
    const handler = new ExamCommandHandler(
      fakeBotUserAccess(activeAccess(USER)),
      registry,
    );
    const { ctx, replies } = fakeCtx('group');

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([]);
  });

  it('сбой при сборке экрана — бот молчит, апдейт не падает', async () => {
    const { registry } = stubExams([EXAM]);
    const failingAccess = {
      resolve: jest.fn().mockRejectedValue(new Error('Mongo недоступна')),
    } as unknown as BotUserAccessService;
    const handler = new ExamCommandHandler(failingAccess, registry);
    const { ctx, replies } = fakeCtx();

    await expect(handler.handle(ctx, NOW)).resolves.toBeUndefined();
    expect(replies).toEqual([]);
  });
});

describe('ExamCommandHandler.listScreen', () => {
  it('переиспользуется кнопкой меню — тот же результат, что у команды', async () => {
    const { registry } = stubExams([EXAM]);
    const handler = new ExamCommandHandler(
      fakeBotUserAccess(activeAccess(USER)),
      registry,
    );

    const menu = await handler.listScreen(111, NOW);

    expect(menu?.text).toContain('Форма');
  });

  it('незнакомец — null, не пустой экран', async () => {
    const { registry } = stubExams([]);
    const handler = new ExamCommandHandler(
      fakeBotUserAccess({ kind: 'unknown' }),
      registry,
    );

    expect(await handler.listScreen(111, NOW)).toBeNull();
  });

  it('заблокированный — экран отказа с кнопкой «В меню»', async () => {
    const { registry } = stubExams([EXAM]);
    const handler = new ExamCommandHandler(
      fakeBotUserAccess({ kind: 'denied', message: ACCESS_MESSAGE }),
      registry,
    );

    const menu = await handler.listScreen(111, NOW);

    expect(menu?.text).toBe(ACCESS_MESSAGE);
    expect(menu?.buttons.flat().map((b) => b.text)).toContain('В меню');
  });
});
