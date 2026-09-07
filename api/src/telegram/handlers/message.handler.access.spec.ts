// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): кто
// может писать боту (chatId, from, роль, тип чата) и сбой сервиса внутри
// потока темы. Сам поток темы — message.handler.spec.ts.
import { DateTime } from 'luxon';
import { SettingsService } from '../../settings/settings.service';
import { LessonsService } from '../../lessons/lessons.service';
import { UsersService } from '../../users/users.service';
import { TopicRebuildService } from '../../broadcasts/topic-rebuild.service';
import { BotSessionService } from '../bot-session.service';
import { MessageHandler } from './message.handler';
import {
  clearMessageHandlerTest,
  fakeCtx,
  seedLesson,
  seedTeacher,
  setupMessageHandlerTest,
  type MessageHandlerTestContext,
} from './message.handler.test-support';

describe('MessageHandler — доступ и сбои', () => {
  let ctx: MessageHandlerTestContext;

  beforeAll(async () => {
    ctx = await setupMessageHandlerTest();
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearMessageHandlerTest(ctx);
  });

  it('нет ctx.from — тихо игнорируется', async () => {
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111, text: 'тема', noFrom: true });

    await ctx.handler.handle(msgCtx);

    expect(replies).toEqual([]);
  });

  it('чужой Telegram ID — игнорируется', async () => {
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 999, text: 'тема' });

    await ctx.handler.handle(msgCtx);

    expect(replies).toEqual([]);
  });

  it('ученик (роль student) — игнорируется', async () => {
    await ctx.userModel.create({ name: 'Ученик', telegramId: 222, roles: ['student'] });
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 222, text: 'тема' });

    await ctx.handler.handle(msgCtx);

    expect(replies).toEqual([]);
  });

  it('сообщение из группы — игнорируется', async () => {
    await seedTeacher(ctx.userModel, 111);
    const { ctx: msgCtx, replies } = fakeCtx({
      chatId: 111,
      chatType: 'group',
      text: 'тема',
    });

    await ctx.handler.handle(msgCtx);

    expect(replies).toEqual([]);
  });

  it('неожиданный сбой (LessonsService.update упал) — логируется, не бросает', async () => {
    await seedTeacher(ctx.userModel, 111);
    const lesson = await seedLesson(ctx.classModel, ctx.lessonModel);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'topic',
      lessonId: lesson._id,
      expiresAt: DateTime.utc().plus({ minutes: 10 }).toJSDate(),
    });
    const usersService = new UsersService(ctx.userModel);
    const failingHandler = new MessageHandler(
      usersService,
      new BotSessionService(ctx.botSessionModel),
      {
        update: jest.fn().mockRejectedValue(new Error('mongo упал')),
      } as unknown as LessonsService,
      new TopicRebuildService(
        ctx.broadcastModel,
        ctx.lessonModel,
        ctx.classModel,
        new SettingsService(
          ctx.settingsModel,
          ctx.lessonModel,
          ctx.classModel,
          usersService,
        ),
        usersService,
      ),
    );
    const { ctx: msgCtx, replies } = fakeCtx({ chatId: 111, text: 'новая тема' });

    await expect(failingHandler.handle(msgCtx)).resolves.toBeUndefined();
    expect(replies).toEqual([]);
  });
});
