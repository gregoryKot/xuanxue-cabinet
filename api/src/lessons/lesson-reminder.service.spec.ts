// Против настоящей Mongo (CLAUDE.md «Тесты», образец —
// recording-prompt.service.spec.ts): условный апдейт studentReminderSentAt
// ДО отправки, окно «(now, now + lessonReminderMinutes]», read-after-write
// строки ленты и переключатель уведомления через настоящий
// NotificationPrefsService (не мок — иначе не поймать, что дефолт ученика
// включён без единого переключения руками, ADR-0135).
import { DateTime } from 'luxon';
import type { Connection, Model, Types } from 'mongoose';
import type { SettingsDto } from '@xuanxue/shared';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import {
  NotificationPrefsRecord,
  NotificationPrefsSchema,
} from '../notifications/notification-prefs.schema';
import { LessonScopeService } from '../notifications/lesson-scope.service';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import {
  NotificationRecord,
  NotificationSchema,
} from '../notifications/notification.schema';
import type { PushSenderService } from '../push/push-sender.service';
import type { SettingsService } from '../settings/settings.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { LessonRecord, LessonSchema } from './lesson.schema';
import { LessonReminderService } from './lesson-reminder.service';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

// Регрессия инцидента 2026-09-27: ученик включил push на iPhone,
// напоминаний о занятиях не приходило — вида `lesson_soon` не было вовсе
// (ADR-0069 убрал его без доставки; ADR-0135 вернул вместе с ней).
describe('LessonReminderService.remind (регрессия 2026-09-27)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;
  let notificationModel: Model<NotificationRecord>;
  let userModel: Model<UserRecord>;
  let prefsModel: Model<NotificationPrefsRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    notificationModel = connection.model<NotificationRecord>(
      NotificationRecord.name,
      NotificationSchema,
    );
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    prefsModel = connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
      NotificationPrefsSchema,
    );
    await notificationModel.syncIndexes();
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      lessonModel.deleteMany({}),
      classModel.deleteMany({}),
      notificationModel.deleteMany({}),
      userModel.deleteMany({}),
      prefsModel.deleteMany({}),
    ]);
  });

  async function createClass(overrides: Partial<ClassRecord> = {}) {
    return classModel.create({
      title: 'Цигун для глаз',
      groupLabel: '',
      format: 'online',
      tz: 'Asia/Jerusalem',
      leadMinutes: 30,
      active: true,
      channelIds: [],
      ...overrides,
    });
  }

  function fakeSettings(lessonReminderMinutes = 60): SettingsService {
    return {
      get: () => Promise.resolve({ lessonReminderMinutes } as SettingsDto),
    } as unknown as SettingsService;
  }

  function fakePush(): { sendToUser: jest.Mock } {
    return { sendToUser: jest.fn().mockResolvedValue(1) };
  }

  function build(push = fakePush(), settings = fakeSettings()) {
    const service = new LessonReminderService(
      lessonModel,
      classModel,
      notificationModel,
      userModel,
      new NotificationPrefsService(prefsModel),
      new LessonScopeService(prefsModel),
      settings,
      push as unknown as PushSenderService,
    );
    return { service, push };
  }

  it('дефолт ученика включён без переключения (ADR-0135) — занятие в окне пишет ленту и шлёт push', async () => {
    const student = await userModel.create({ name: 'Ваня', roles: [], status: 'active' });
    const cls = await createClass();
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ minutes: 30 }).toJSDate(),
      durationMin: 60,
      topic: 'цигун',
      status: 'scheduled',
    });
    const { service, push } = build();

    const result = await service.remind(NOW);

    expect(result).toEqual({ reminded: 1 });
    expect(push.sendToUser).toHaveBeenCalledWith(student._id.toString(), NOW);
    const row = await notificationModel
      .findOne({ userId: student._id.toString(), kind: 'lesson_soon' })
      .lean();
    expect(row?.lessonId).toBe(lesson._id.toString());
    const updated = await lessonModel.findById(lesson._id).lean();
    expect(updated?.studentReminderSentAt).toBeInstanceOf(Date);
  });

  // ADR-0162: человек сам выбирает, о каких занятиях ему напоминать.
  describe('выбор «о каких занятиях» (ADR-0162)', () => {
    async function scheduleLesson(classId: Types.ObjectId) {
      return lessonModel.create({
        classId,
        startsAt: NOW.plus({ minutes: 30 }).toJSDate(),
        durationMin: 60,
        topic: 'цигун',
        status: 'scheduled',
      });
    }

    function inboxRowsOf(userId: string) {
      return notificationModel.find({ userId, kind: 'lesson_soon' }).lean();
    }

    it('выбрал другое занятие — по этому ни ленты, ни push, а второй ученик без выбора получает', async () => {
      const picky = await userModel.create({ name: 'Ваня', roles: [], status: 'active' });
      const plain = await userModel.create({ name: 'Маша', roles: [], status: 'active' });
      const thisClass = await createClass({ title: 'Цигун для глаз' });
      const otherClass = await createClass({ title: 'Тайцзи' });
      await scheduleLesson(thisClass._id);
      await new LessonScopeService(prefsModel).set(picky._id.toString(), {
        mode: 'selected',
        classIds: [otherClass._id.toString()],
      });
      const { service, push } = build();

      expect(await service.remind(NOW)).toEqual({ reminded: 1 });

      expect(await inboxRowsOf(picky._id.toString())).toEqual([]);
      expect(await inboxRowsOf(plain._id.toString())).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenCalledTimes(1);
      expect(push.sendToUser).toHaveBeenCalledWith(plain._id.toString(), NOW);
    });

    it('выбрал именно это занятие — напоминание приходит', async () => {
      const student = await userModel.create({
        name: 'Ваня',
        roles: [],
        status: 'active',
      });
      const thisClass = await createClass();
      const otherClass = await createClass({ title: 'Тайцзи' });
      await scheduleLesson(thisClass._id);
      await new LessonScopeService(prefsModel).set(student._id.toString(), {
        mode: 'selected',
        classIds: [otherClass._id.toString(), thisClass._id.toString()],
      });
      const { service, push } = build();

      expect(await service.remind(NOW)).toEqual({ reminded: 1 });

      expect(await inboxRowsOf(student._id.toString())).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenCalledWith(student._id.toString(), NOW);
    });

    it('режим «все» со старыми галочками — напоминание приходит о любом занятии', async () => {
      const student = await userModel.create({
        name: 'Ваня',
        roles: [],
        status: 'active',
      });
      const thisClass = await createClass();
      const otherClass = await createClass({ title: 'Тайцзи' });
      await scheduleLesson(thisClass._id);
      await new LessonScopeService(prefsModel).set(student._id.toString(), {
        mode: 'all',
        classIds: [otherClass._id.toString()],
      });
      const { service } = build();

      expect(await service.remind(NOW)).toEqual({ reminded: 1 });

      expect(await inboxRowsOf(student._id.toString())).toHaveLength(1);
    });

    it('«выбранные» без единой галочки — ни о каких; занятие при этом помечено как разобранное', async () => {
      const student = await userModel.create({
        name: 'Ваня',
        roles: [],
        status: 'active',
      });
      const cls = await createClass();
      const lesson = await scheduleLesson(cls._id);
      await new LessonScopeService(prefsModel).set(student._id.toString(), {
        mode: 'selected',
        classIds: [],
      });
      const { service, push } = build();

      await service.remind(NOW);

      expect(await inboxRowsOf(student._id.toString())).toEqual([]);
      expect(push.sendToUser).not.toHaveBeenCalled();
      const updated = await lessonModel.findById(lesson._id).lean();
      expect(updated?.studentReminderSentAt).toBeInstanceOf(Date);
    });

    it('выбор одного ученика не влияет на второго: у каждого свой список', async () => {
      const first = await userModel.create({ name: 'Ваня', roles: [], status: 'active' });
      const second = await userModel.create({
        name: 'Маша',
        roles: [],
        status: 'active',
      });
      const thisClass = await createClass();
      const otherClass = await createClass({ title: 'Тайцзи' });
      await scheduleLesson(thisClass._id);
      const scopes = new LessonScopeService(prefsModel);
      await scopes.set(first._id.toString(), {
        mode: 'selected',
        classIds: [thisClass._id.toString()],
      });
      await scopes.set(second._id.toString(), {
        mode: 'selected',
        classIds: [otherClass._id.toString()],
      });
      const { service } = build();

      await service.remind(NOW);

      expect(await inboxRowsOf(first._id.toString())).toHaveLength(1);
      expect(await inboxRowsOf(second._id.toString())).toEqual([]);
    });
  });

  it('занятие вне окна (позже lessonReminderMinutes) — не напоминает', async () => {
    const cls = await createClass();
    await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ minutes: 90 }).toJSDate(),
      durationMin: 60,
      topic: 'цигун',
      status: 'scheduled',
    });
    const { service } = build();

    expect(await service.remind(NOW)).toEqual({ reminded: 0 });
  });

  it('занятие уже началось (startsAt <= now) — не напоминает', async () => {
    const cls = await createClass();
    await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.toJSDate(),
      durationMin: 60,
      topic: 'цигун',
      status: 'scheduled',
    });
    const { service } = build();

    expect(await service.remind(NOW)).toEqual({ reminded: 0 });
  });

  it('ученик выключил lesson_soon — не получает ни ленту, ни push', async () => {
    const student = await userModel.create({ name: 'Ваня', roles: [], status: 'active' });
    await new NotificationPrefsService(prefsModel).set(
      student._id.toString(),
      'lesson_soon',
      false,
    );
    const cls = await createClass();
    await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ minutes: 30 }).toJSDate(),
      durationMin: 60,
      topic: 'цигун',
      status: 'scheduled',
    });
    const { service, push } = build();

    expect(await service.remind(NOW)).toEqual({ reminded: 0 });
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('уже отправлено (studentReminderSentAt стоит) — второй вызов не дублирует', async () => {
    await userModel.create({ name: 'Ваня', roles: [], status: 'active' });
    const cls = await createClass();
    await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ minutes: 30 }).toJSDate(),
      durationMin: 60,
      topic: 'цигун',
      status: 'scheduled',
      studentReminderSentAt: NOW.minus({ minutes: 5 }).toJSDate(),
    });
    const { service, push } = build();

    expect(await service.remind(NOW)).toEqual({ reminded: 0 });
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('класс выключен — не напоминает', async () => {
    await userModel.create({ name: 'Ваня', roles: [], status: 'active' });
    const cls = await createClass({ active: false });
    await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ minutes: 30 }).toJSDate(),
      durationMin: 60,
      topic: 'цигун',
      status: 'scheduled',
    });
    const { service, push } = build();

    expect(await service.remind(NOW)).toEqual({ reminded: 0 });
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('нет активных учеников — не трогает базу занятий, reminded: 0', async () => {
    const cls = await createClass();
    await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ minutes: 30 }).toJSDate(),
      durationMin: 60,
      topic: 'цигун',
      status: 'scheduled',
    });
    const { service } = build();

    expect(await service.remind(NOW)).toEqual({ reminded: 0 });
  });

  it('DST Asia/Jerusalem: окно считается по UTC-разнице, не по локальной стрелке', async () => {
    // Тот же переход, что в recording-prompt.service.spec.ts: ночь на
    // 2026-03-27, 02:00 IST → 03:00 IDT. Занятие через 30 минут по UTC
    // должно остаться в окне «lessonReminderMinutes = 60» независимо от
    // локального перевода стрелок.
    await userModel.create({ name: 'Ваня', roles: [], status: 'active' });
    const cls = await createClass();
    const now = DateTime.fromISO('2026-03-26T23:30:00Z', { zone: 'utc' });
    await lessonModel.create({
      classId: cls._id,
      startsAt: now.plus({ minutes: 30 }).toJSDate(),
      durationMin: 60,
      topic: 'цигун',
      status: 'scheduled',
    });
    const { service } = build();

    expect(await service.remind(now)).toEqual({ reminded: 1 });
  });
});
