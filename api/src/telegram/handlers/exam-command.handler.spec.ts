// Фейковый ExamBotPort, фейковый BotUserAccessService и фейковый
// SettingsService, без Mongo и без сети (CLAUDE.md «Тесты»): /exams,
// /экзамены — то же самое, что MyExamsService отдаёт кабинету (через порт),
// незнакомцу — вежливый отказ, как у /start (ADR-0090, отзыв владельца
// 2026-09-21: молчание на пункте общего меню читалось как «бот сломан»),
// blocked — отказ вместо списка (SECURITY §9).
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { ACCESS_MESSAGE, type MyExamDto } from '@xuanxue/shared';
import type { SettingsService } from '../../settings/settings.service';
import type { UserLean } from '../../users/users.service';
import type { BotUserAccessService } from '../bot-user-access.service';
import { activeAccess, fakeBotUserAccess } from '../bot-user-access.service.test-support';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { buildStrangerMessage } from './bot-menu';
import { ExamCommandHandler } from './exam-command.handler';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const NEWCOMER_CONTACT = 'Диме @Dmitry_Deitch';
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

function fakeSettings(): SettingsService {
  return {
    get: () => Promise.resolve({ newcomerContact: NEWCOMER_CONTACT }),
  } as unknown as SettingsService;
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
      fakeSettings(),
    );
    const { ctx, replies } = fakeCtx();

    await handler.handle(ctx, NOW);

    expect(listMyExams).toHaveBeenCalledWith(USER, NOW);
    expect(replies[0]).toContain('Форма');
  });

  // ADR-0090 + отзыв владельца 2026-09-21: /exams — в общем списке команд
  // Telegram, его видит и незнакомец; молчание на нём читалось как «бот
  // сломан», поэтому теперь тот же вежливый отказ, что и у /start.
  it('незнакомец — вежливый отказ, как у /start, а не молчание', async () => {
    const { registry } = stubExams([]);
    const handler = new ExamCommandHandler(
      fakeBotUserAccess({ kind: 'unknown' }),
      registry,
      fakeSettings(),
    );
    const { ctx, replies } = fakeCtx();

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([buildStrangerMessage(NEWCOMER_CONTACT)]);
  });

  it('заблокированный — отказ тем же текстом, что в вебе, список не запрашивается', async () => {
    const { registry, listMyExams } = stubExams([EXAM]);
    const handler = new ExamCommandHandler(
      fakeBotUserAccess({ kind: 'denied', message: ACCESS_MESSAGE }),
      registry,
      fakeSettings(),
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
      fakeSettings(),
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
    const handler = new ExamCommandHandler(failingAccess, registry, fakeSettings());
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
      fakeSettings(),
    );

    const menu = await handler.listScreen(111, NOW);

    expect(menu?.text).toContain('Форма');
  });

  // Контракт не меняется: кнопка меню (open-menu-screen.ts) от null просто
  // не трогает сообщение — вежливый отказ незнакомцу собирает handle(),
  // отдельным тестом выше в ExamCommandHandler.handle.
  it('незнакомец — null, не пустой экран', async () => {
    const { registry } = stubExams([]);
    const handler = new ExamCommandHandler(
      fakeBotUserAccess({ kind: 'unknown' }),
      registry,
      fakeSettings(),
    );

    expect(await handler.listScreen(111, NOW)).toBeNull();
  });

  it('заблокированный — экран отказа с кнопкой «В меню»', async () => {
    const { registry } = stubExams([EXAM]);
    const handler = new ExamCommandHandler(
      fakeBotUserAccess({ kind: 'denied', message: ACCESS_MESSAGE }),
      registry,
      fakeSettings(),
    );

    const menu = await handler.listScreen(111, NOW);

    expect(menu?.text).toBe(ACCESS_MESSAGE);
    expect(menu?.buttons.flat().map((b) => b.text)).toContain('В меню');
  });
});
