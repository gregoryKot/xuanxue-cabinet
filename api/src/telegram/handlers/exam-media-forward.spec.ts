// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): кто
// получает пересланное видео — дело того же PersonalChats.listFor, что и
// текстовое attempt_submitted (telegram-exam-notifier.spec.ts). Здесь —
// именно аудит 2026-09, находка 1: раньше видео шло `personalChats.list()`
// (весь штат с подключённым ботом) мимо переключателя уведомлений и мимо
// решения владельца не давать этот вид админу.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { Context } from 'telegraf';
import type { UserRole } from '@xuanxue/shared';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { NotificationPrefsRecord } from '../../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../../notifications/notification-prefs.service';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import { PersonalChats } from '../personal-chats';
import { forwardExamVideoToTeachers } from './exam-media-forward';

const NOW = DateTime.fromISO('2026-09-15T09:00:00Z', { zone: 'utc' });
const ATTEMPT_ID = '507f1f77bcf86cd799439011';

function fakeCtx(): {
  ctx: Context;
  sentMessages: { chatId: string; text: string }[];
  copiedTo: string[];
} {
  const sentMessages: { chatId: string; text: string }[] = [];
  const copiedTo: string[] = [];
  const ctx = {
    chat: { id: 111, type: 'private' },
    message: {
      message_id: 42,
      video: { file_id: 'f1', file_unique_id: 'u1', duration: 30 },
    },
    telegram: {
      sendMessage: (toChatId: string, text: string) => {
        sentMessages.push({ chatId: toChatId, text });
        return Promise.resolve();
      },
      copyMessage: (toChatId: string) => {
        copiedTo.push(toChatId);
        return Promise.resolve();
      },
    },
  } as unknown as Context;
  return { ctx, sentMessages, copiedTo };
}

describe('forwardExamVideoToTeachers (аудит 2026-09, находка 1)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let channelModel: Model<ChannelRecord>;
  let notificationPrefsModel: Model<NotificationPrefsRecord>;
  let personalChats: PersonalChats;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    notificationPrefsModel = connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
    personalChats = new PersonalChats(
      new UsersService(userModel),
      channelModel,
      new NotificationPrefsService(notificationPrefsModel),
    );
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

  it('сотрудник выключил attempt_submitted — видео ему не пересылается', async () => {
    const teacherId = await connectPerson(111, 'Мария', ['teacher']);
    await connectPerson(222, 'Пётр', ['assistant']);
    await notificationPrefsModel.create({
      userId: teacherId,
      overrides: [{ kind: 'attempt_submitted', enabled: false }],
    });
    const { ctx, sentMessages, copiedTo } = fakeCtx();

    await forwardExamVideoToTeachers(
      ctx,
      personalChats,
      'Ученик',
      'Экзамен',
      ATTEMPT_ID,
      NOW,
    );

    expect(copiedTo).toEqual(['222']);
    expect(sentMessages.map((m) => m.chatId)).toEqual(['222']);
  });

  it('админ видео не получает (нет attempt_submitted по дефолту роли, отзыв владельца 2026-09-12)', async () => {
    await connectPerson(111, 'Мария', ['teacher']);
    await connectPerson(333, 'Дима', ['admin']);
    const { ctx, copiedTo } = fakeCtx();

    await forwardExamVideoToTeachers(
      ctx,
      personalChats,
      'Ученик',
      'Экзамен',
      ATTEMPT_ID,
      NOW,
    );

    expect(copiedTo).toEqual(['111']);
    expect(copiedTo).not.toContain('333');
  });

  it('ни у кого нет личного чата — не падает, ничего не шлёт', async () => {
    const { ctx, sentMessages, copiedTo } = fakeCtx();

    await expect(
      forwardExamVideoToTeachers(
        ctx,
        personalChats,
        'Ученик',
        'Экзамен',
        ATTEMPT_ID,
        NOW,
      ),
    ).resolves.toBeUndefined();
    expect(sentMessages).toEqual([]);
    expect(copiedTo).toEqual([]);
  });
});
