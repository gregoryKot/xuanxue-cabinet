// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// deleteMany/updateMany по реестру и read-after-write на каждой части —
// мок модели пропустил бы саму механику $unset и фильтров.
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { BroadcastRecord } from '../broadcasts/broadcast.schema';
import { ChannelRecord } from '../channels/channel.schema';
import { ClassRecord } from '../classes/class.schema';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import { ExamGradingRecord } from '../exams/exam-grading.schema';
import { LessonRecord } from '../lessons/lesson.schema';
import { NotificationPrefsRecord } from '../notifications/notification-prefs.schema';
import { BotSessionRecord } from '../telegram/bot-session.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserDeletionService } from './user-deletion.service';
import { UserRecord } from './user.schema';
import { UsersService } from './users.service';

function openService(memory: MemoryMongo): {
  users: UsersService;
  deletion: UserDeletionService;
  userModel: Model<UserRecord>;
} {
  const userModel = memory.connection.model<UserRecord>(UserRecord.name);
  const users = new UsersService(userModel);
  const deletion = new UserDeletionService(memory.connection, users);
  return { users, deletion, userModel };
}

describe('UserDeletionService', () => {
  let memory: MemoryMongo;
  let users: UsersService;
  let deletion: UserDeletionService;
  let userModel: Model<UserRecord>;
  let classModel: Model<ClassRecord>;
  let lessonModel: Model<LessonRecord>;
  let channelModel: Model<ChannelRecord>;
  let broadcastModel: Model<BroadcastRecord>;
  let botSessionModel: Model<BotSessionRecord>;
  let attemptModel: Model<ExamAttemptRecord>;
  let gradingModel: Model<ExamGradingRecord>;
  let notificationPrefsModel: Model<NotificationPrefsRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    ({ users, deletion, userModel } = openService(memory));
    classModel = memory.connection.model<ClassRecord>(ClassRecord.name);
    lessonModel = memory.connection.model<LessonRecord>(LessonRecord.name);
    channelModel = memory.connection.model<ChannelRecord>(ChannelRecord.name);
    broadcastModel = memory.connection.model<BroadcastRecord>(BroadcastRecord.name);
    botSessionModel = memory.connection.model<BotSessionRecord>(BotSessionRecord.name);
    attemptModel = memory.connection.model<ExamAttemptRecord>(ExamAttemptRecord.name);
    gradingModel = memory.connection.model<ExamGradingRecord>(ExamGradingRecord.name);
    notificationPrefsModel = memory.connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      userModel.deleteMany({}),
      classModel.deleteMany({}),
      lessonModel.deleteMany({}),
      channelModel.deleteMany({}),
      broadcastModel.deleteMany({}),
      botSessionModel.deleteMany({}),
      attemptModel.deleteMany({}),
      gradingModel.deleteMany({}),
      notificationPrefsModel.deleteMany({}),
    ]);
  });

  it('несуществующий id — NotFoundError', async () => {
    await expect(
      deletion.deleteAllUserData('507f1f77bcf86cd799439011', 'кто-то'),
    ).rejects.toThrow('Пользователь не найден');
  });

  it('невалидный ObjectId — NotFoundError, не падение', async () => {
    await expect(deletion.deleteAllUserData('не-id', 'кто-то')).rejects.toThrow(
      'Пользователь не найден',
    );
  });

  it('себя — ForbiddenError с объяснением и действием', async () => {
    const admin = await users.createFromTelegram({
      telegramId: 5001,
      name: 'Себя не удалить',
      roles: ['admin'],
    });
    await users.createFromTelegram({
      telegramId: 5002,
      name: 'Второй админ',
      roles: ['admin'],
    });

    await expect(deletion.deleteAllUserData(admin.id, admin.id)).rejects.toThrow(
      'Свой аккаунт удалить нельзя',
    );
  });

  it('последний админ — ForbiddenError', async () => {
    const onlyAdmin = await users.createFromTelegram({
      telegramId: 5003,
      name: 'Единственный админ',
      roles: ['admin'],
    });

    await expect(
      deletion.deleteAllUserData(onlyAdmin.id, 'кто-то-другой'),
    ).rejects.toThrow('последний администратор');
  });

  it('не последний админ — удаляется, документ users исчезает (read-after-write)', async () => {
    const admin = await users.createFromTelegram({
      telegramId: 5004,
      name: 'Первый админ',
      roles: ['admin'],
    });
    await users.createFromTelegram({
      telegramId: 5005,
      name: 'Второй админ',
      roles: ['admin'],
    });

    await deletion.deleteAllUserData(admin.id, 'кто-то-другой');

    expect(await users.findById(admin.id)).toBeNull();
  });

  // Первая коллекция во владении ученика (USER_OWNED_COLLECTIONS перестал
  // быть пустым вместе со слоем 4.4) — до неё ветка deleteMany по реестру
  // работала вхолостую и ничем не проверялась.
  it('удаляет попытки экзамена ученика и не трогает чужие', async () => {
    const student = await users.createFromTelegram({
      telegramId: 5010,
      name: 'Ученик',
      roles: ['student'],
    });
    const other = await users.createFromTelegram({
      telegramId: 5011,
      name: 'Другой ученик',
      roles: ['student'],
    });
    const examId = new Types.ObjectId();
    await attemptModel.create([
      {
        examId,
        examTitle: 'Экзамен',
        userId: new Types.ObjectId(student.id),
        attemptNo: 1,
        startedAt: new Date('2026-09-12T09:00:00.000Z'),
      },
      {
        examId,
        examTitle: 'Экзамен',
        userId: new Types.ObjectId(other.id),
        attemptNo: 1,
        startedAt: new Date('2026-09-12T09:00:00.000Z'),
      },
    ]);

    await deletion.deleteAllUserData(student.id, 'кто-то-другой');

    expect(await attemptModel.countDocuments({ userId: student.id })).toBe(0);
    expect(await attemptModel.countDocuments({ userId: other.id })).toBe(1);
  });

  // Вторая коллекция с userId (ТЗ notifications-api.md) — та же ветка
  // USER_OWNED_COLLECTIONS, что и попытки экзамена выше, отдельным тестом:
  // забытая здесь модель ловится сверкой в user-data.registry.spec.ts, а
  // фактическое поведение deleteMany — только настоящим тестом на Mongo.
  it('удаляет настройки уведомлений ученика и не трогает чужие', async () => {
    const student = await users.createFromTelegram({
      telegramId: 5012,
      name: 'Ученик с настройками',
      roles: ['student'],
    });
    const other = await users.createFromTelegram({
      telegramId: 5013,
      name: 'Другой ученик',
      roles: ['student'],
    });
    await notificationPrefsModel.create([
      { userId: student.id, overrides: [{ kind: 'lesson_soon', enabled: false }] },
      { userId: other.id, overrides: [{ kind: 'lesson_soon', enabled: false }] },
    ]);

    await deletion.deleteAllUserData(student.id, 'кто-то-другой');

    expect(await notificationPrefsModel.countDocuments({ userId: student.id })).toBe(0);
    expect(await notificationPrefsModel.countDocuments({ userId: other.id })).toBe(1);
  });

  // Третья коллекция с userId (слой 4.6, ADR-0022) — оценка попытки по
  // рубрике: userId здесь про ученика, чью работу проверили, не про того,
  // кто проверял (graderId — обычная ссылка, см. тест ниже).
  it('удаляет оценки экзамена ученика и не трогает чужие', async () => {
    const student = await users.createFromTelegram({
      telegramId: 5014,
      name: 'Ученик с оценкой',
      roles: ['student'],
    });
    const other = await users.createFromTelegram({
      telegramId: 5015,
      name: 'Другой ученик',
      roles: ['student'],
    });
    const teacher = await users.createFromTelegram({
      telegramId: 5016,
      name: 'Проверяющий',
      roles: ['teacher'],
    });
    const attemptId = new Types.ObjectId();
    await gradingModel.create([
      {
        attemptId,
        examId: new Types.ObjectId(),
        userId: new Types.ObjectId(student.id),
        graderId: new Types.ObjectId(teacher.id),
        outcome: 'passed',
        gradedAt: new Date('2026-09-13T09:00:00.000Z'),
      },
      {
        attemptId: new Types.ObjectId(),
        examId: new Types.ObjectId(),
        userId: new Types.ObjectId(other.id),
        graderId: new Types.ObjectId(teacher.id),
        outcome: 'passed',
        gradedAt: new Date('2026-09-13T09:00:00.000Z'),
      },
    ]);

    await deletion.deleteAllUserData(student.id, 'кто-то-другой');

    expect(await gradingModel.countDocuments({ userId: student.id })).toBe(0);
    expect(await gradingModel.countDocuments({ userId: other.id })).toBe(1);
  });

  it('обнуляет leaderId в классе и занятии — $unset, документы остаются', async () => {
    const leader = await users.createFromTelegram({
      telegramId: 5006,
      name: 'Ведущий',
      roles: ['teacher'],
    });
    const cls = await classModel.create({
      title: 'Тайцзицюань',
      format: 'online',
      leaderId: leader.id,
    });
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: new Date('2026-09-10T16:00:00Z'),
      durationMin: 45,
      leaderId: leader.id,
    });

    await deletion.deleteAllUserData(leader.id, 'админ');

    const foundClass = await classModel.findById(cls._id).lean<{
      leaderId?: Types.ObjectId;
    }>();
    const foundLesson = await lessonModel.findById(lesson._id).lean<{
      leaderId?: Types.ObjectId;
    }>();
    expect(foundClass?.leaderId).toBeUndefined();
    expect(foundLesson?.leaderId).toBeUndefined();
  });

  it('обнуляет createdBy в канале и рассылке', async () => {
    const author = await users.createFromTelegram({
      telegramId: 5007,
      name: 'Автор',
      roles: ['admin'],
    });
    await users.createFromTelegram({
      telegramId: 5008,
      name: 'Второй админ',
      roles: ['admin'],
    });
    const channel = await channelModel.create({
      type: 'manual',
      title: 'Ручной канал',
      config: '{}',
      createdBy: author.id,
    });
    const broadcast = await broadcastModel.create({
      kind: 'manual',
      text: 'Текст',
      scheduledAt: new Date('2026-09-10T16:00:00Z'),
      channelIds: [channel._id],
      createdBy: author.id,
    });

    await deletion.deleteAllUserData(author.id, 'кто-то-другой');

    const foundChannel = await channelModel.findById(channel._id).lean<{
      createdBy?: Types.ObjectId;
    }>();
    const foundBroadcast = await broadcastModel.findById(broadcast._id).lean<{
      createdBy?: Types.ObjectId;
    }>();
    expect(foundChannel?.createdBy).toBeUndefined();
    expect(foundBroadcast?.createdBy).toBeUndefined();
  });

  it('удаляет ожидание бота (bot_sessions) по chatId = telegramId', async () => {
    const teacher = await users.createFromTelegram({
      telegramId: 5009,
      name: 'Учитель с ботом',
      roles: ['teacher'],
    });
    const cls = await classModel.create({
      title: 'Класс для ожидания',
      format: 'online',
    });
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: new Date('2026-09-10T16:00:00Z'),
      durationMin: 45,
    });
    // Содержимое ожидания тут не важно — важен ключ chatId = telegramId учителя
    // (teacher-chats.ts: String(telegramId) как chatId личного чата).
    await botSessionModel.create({
      chatId: 5009,
      kind: 'topic',
      lessonId: lesson._id,
      expiresAt: new Date('2026-09-10T16:30:00Z'),
    });

    await deletion.deleteAllUserData(teacher.id, 'админ');

    expect(await botSessionModel.findOne({ chatId: 5009 })).toBeNull();
  });
});
