// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): кто
// получает уведомление о привязанной ссылке — дело того же
// PersonalChats.listFor('attempt_submitted', …), что и у пересылки видео из
// бота (exam-media-forward.spec.ts, тот же образец) и у текстового
// «работу сдали» (telegram-exam-notifier.spec.ts). ADR-0084: ссылка теперь
// основной путь ответа на видео-вопрос — молчание об адресатах здесь было бы
// тем же тихим отказом, что аудит 2026-09 уже нашёл у пересылки видео.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { UserRole } from '@xuanxue/shared';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import type { LinkAttachedContext } from '../media/exam-media-notifier.port';
import { ExamMediaNotifierRegistry } from '../media/exam-media-notifier.port';
import { NotificationPrefsRecord } from '../notifications/notification-prefs.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { buildPersonalChats } from './test-support/build-personal-chats';
import { TelegramExamMediaNotifier } from './telegram-exam-media-notifier';
import type { TelegramBotService } from './telegram-bot.service';

const NOW = DateTime.fromISO('2026-09-21T09:00:00Z', { zone: 'utc' });
const CONTEXT: LinkAttachedContext = {
  attemptId: '507f1f77bcf86cd799439011',
  userId: '507f1f77bcf86cd799439012',
  examTitle: 'Экзамен по третьей форме',
  url: 'https://vk.com/video-secret',
};

function fakeBot(): {
  bot: TelegramBotService;
  sent: { chatId: string; text: string }[];
} {
  const sent: { chatId: string; text: string }[] = [];
  const bot = {
    sendMessage: (chatId: string, text: string) => {
      sent.push({ chatId, text });
      return Promise.resolve(true);
    },
  } as unknown as TelegramBotService;
  return { bot, sent };
}

describe('TelegramExamMediaNotifier (ADR-0084)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let channelModel: Model<ChannelRecord>;
  let notificationPrefsModel: Model<NotificationPrefsRecord>;
  let usersService: UsersService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    notificationPrefsModel = connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
    usersService = new UsersService(userModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await userModel.deleteMany({});
    await channelModel.deleteMany({});
    await notificationPrefsModel.deleteMany({});
  });

  async function connectPerson(telegramId: number, name: string, roles: UserRole[]) {
    const user = await userModel.create({ name, telegramId, roles });
    await channelModel.create({
      type: 'telegram',
      title: `Личные сообщения: ${name}`,
      config: '{}',
      target: String(telegramId),
      active: true,
    });
    return user._id.toString();
  }

  function buildNotifier(bot: TelegramBotService): TelegramExamMediaNotifier {
    const personalChats = buildPersonalChats(connection, usersService, channelModel);
    return new TelegramExamMediaNotifier(
      personalChats,
      usersService,
      bot,
      new ExamMediaNotifierRegistry(),
    );
  }

  it('сотрудник выключил attempt_submitted — ссылку ему не присылаем', async () => {
    const teacherId = await connectPerson(111, 'Мария', ['teacher']);
    await connectPerson(222, 'Пётр', ['assistant']);
    await notificationPrefsModel.create({
      userId: teacherId,
      overrides: [{ kind: 'attempt_submitted', enabled: false }],
    });
    const { bot, sent } = fakeBot();

    await buildNotifier(bot).notifyLinkAttached(CONTEXT, NOW);

    expect(sent.map((m) => m.chatId)).toEqual(['222']);
  });

  it('админ не получает (нет attempt_submitted по дефолту роли, отзыв владельца 2026-09-12)', async () => {
    await connectPerson(111, 'Мария', ['teacher']);
    await connectPerson(333, 'Дима', ['admin']);
    const { bot, sent } = fakeBot();

    await buildNotifier(bot).notifyLinkAttached(CONTEXT, NOW);

    expect(sent.map((m) => m.chatId)).toEqual(['111']);
  });

  it('ни у кого нет личного чата — не падает, ничего не шлёт', async () => {
    const { bot, sent } = fakeBot();

    await expect(
      buildNotifier(bot).notifyLinkAttached(CONTEXT, NOW),
    ).resolves.toBeUndefined();

    expect(sent).toEqual([]);
  });

  it('текст ушедшего сообщения несёт имя ученика (резолв по userId) и ссылку', async () => {
    const studentId = await userModel
      .create({ name: 'Ученик Иванов', roles: [] })
      .then((doc) => doc._id.toString());
    await connectPerson(111, 'Мария', ['teacher']);
    const { bot, sent } = fakeBot();

    await buildNotifier(bot).notifyLinkAttached({ ...CONTEXT, userId: studentId }, NOW);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain('Ученик Иванов');
    expect(sent[0]?.text).toContain(CONTEXT.url);
  });
});
