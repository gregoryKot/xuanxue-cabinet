// Против настоящей Mongo (CLAUDE.md «Тесты», образец — lesson-reminder.service.spec.ts):
// «Занятие отменено» — шаг тика (ADR-0162, п. 4). Учитель отменил занятие, а
// ленту и push ученикам пишет не PATCH, а этот шаг: строка ленты с уникальным
// индексом (userId, kind, lessonId) — и «уже сообщили», и защита от дубля при
// втором тике или втором инстансе. Получатели — настоящие сервисы настроек
// (не мок): иначе не поймать, что вид включён ученику без переключения руками.
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Connection, Model, Types } from 'mongoose';
import type { NotificationKind } from '@xuanxue/shared';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { LessonRecipientsService } from '../notifications/lesson-recipients.service';
import { LessonScopeService } from '../notifications/lesson-scope.service';
import {
  NotificationPrefsRecord,
  NotificationPrefsSchema,
} from '../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import {
  NOTIFICATION_ENCRYPT_SCHEMA,
  NotificationRecord,
  NotificationSchema,
} from '../notifications/notification.schema';
import type { PushSenderService } from '../push/push-sender.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { decryptRecord } from '../utils/encryption';
import { UserRecord, UserSchema } from '../users/user.schema';
import { CANCEL_NOTICE_WINDOW_HOURS } from './lesson-cancel-notice-queries';
import { LessonCancelNoticeService } from './lesson-cancel-notice.service';
import { LessonRecord, LessonSchema } from './lesson.schema';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const CANCELLED_AT = NOW.minus({ minutes: 1 });
const STARTS_IN_DAYS = 3;

describe('LessonCancelNoticeService.announce (ADR-0162)', () => {
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

  function createClass(overrides: Partial<ClassRecord> = {}) {
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

  /** По умолчанию — отменённое минуту назад занятие через три дня. */
  function cancelledLesson(
    classId: Types.ObjectId,
    overrides: Partial<LessonRecord> = {},
  ) {
    return lessonModel.create({
      classId,
      startsAt: NOW.plus({ days: STARTS_IN_DAYS }).toJSDate(),
      durationMin: 60,
      topic: 'цигун',
      status: 'cancelled',
      cancelledAt: CANCELLED_AT.toJSDate(),
      ...overrides,
    });
  }

  async function student(name: string): Promise<string> {
    const user = await userModel.create({ name, roles: [], status: 'active' });
    return user._id.toString();
  }

  function rowsOf(userId: string, kind: NotificationKind = 'lesson_cancelled') {
    return notificationModel.find({ userId, kind }).lean();
  }

  function fakePush(): { sendToUser: jest.Mock } {
    return { sendToUser: jest.fn().mockResolvedValue(1) };
  }

  function build(push = fakePush()) {
    const service = new LessonCancelNoticeService(
      lessonModel,
      classModel,
      notificationModel,
      new LessonRecipientsService(
        userModel,
        new NotificationPrefsService(prefsModel),
        new LessonScopeService(prefsModel),
      ),
      push as unknown as PushSenderService,
    );
    return { service, push };
  }

  it('отменённое будущее занятие — строка ленты и push ученику, без переключения руками', async () => {
    const id = await student('Ваня');
    const cls = await createClass({ title: 'Тайцзи' });
    const lesson = await cancelledLesson(cls._id);
    const { service, push } = build();

    expect(await service.announce(NOW)).toEqual({ notified: 1 });

    expect(push.sendToUser).toHaveBeenCalledWith(id, NOW);
    const [row] = await rowsOf(id);
    expect(row?.lessonId).toBe(lesson._id.toString());
    expect(row?.lessonStartsAt).toEqual(NOW.plus({ days: STARTS_IN_DAYS }).toJSDate());
    expect(row?.readAt).toBeNull();
    // Название класса — снимок, зашифрованный схемой ленты, а не открытый текст.
    expect(row?.lessonTitle).not.toBe('Тайцзи');
    expect(decryptRecord(row ?? {}, NOTIFICATION_ENCRYPT_SCHEMA)).toMatchObject({
      lessonTitle: 'Тайцзи',
    });
  });

  it('всем активным ученикам с включённым видом: у каждого своя строка и свой push', async () => {
    const first = await student('Ваня');
    const second = await student('Маша');
    const cls = await createClass();
    await cancelledLesson(cls._id);
    const { service, push } = build();

    expect(await service.announce(NOW)).toEqual({ notified: 2 });

    expect(await rowsOf(first)).toHaveLength(1);
    expect(await rowsOf(second)).toHaveLength(1);
    expect(push.sendToUser).toHaveBeenCalledTimes(2);
  });

  it('штат школы не получает: отмену занятий делает сам учитель', async () => {
    const teacher = await userModel.create({
      name: 'Учитель',
      roles: ['teacher'],
      status: 'active',
    });
    const cls = await createClass();
    await cancelledLesson(cls._id);
    const { service, push } = build();

    expect(await service.announce(NOW)).toEqual({ notified: 0 });

    expect(await rowsOf(teacher._id.toString())).toEqual([]);
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('ученик выключил «Занятие отменено» — ни ленты, ни push, а напоминание о занятии у него осталось', async () => {
    const id = await student('Ваня');
    await new NotificationPrefsService(prefsModel).set(id, 'lesson_cancelled', false);
    const cls = await createClass();
    await cancelledLesson(cls._id);
    const { service, push } = build();

    expect(await service.announce(NOW)).toEqual({ notified: 0 });

    expect(await rowsOf(id)).toEqual([]);
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  // ADR-0162: человек сам выбирает, о каких занятиях ему сообщать.
  describe('выбор «о каких занятиях»', () => {
    it('выбрал другое занятие — по этому ни ленты, ни push, а второй без выбора получает', async () => {
      const picky = await student('Ваня');
      const plain = await student('Маша');
      const thisClass = await createClass({ title: 'Цигун для глаз' });
      const otherClass = await createClass({ title: 'Тайцзи' });
      await cancelledLesson(thisClass._id);
      await new LessonScopeService(prefsModel).set(picky, {
        mode: 'selected',
        classIds: [otherClass._id.toString()],
      });
      const { service, push } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 1 });

      expect(await rowsOf(picky)).toEqual([]);
      expect(await rowsOf(plain)).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenCalledTimes(1);
      expect(push.sendToUser).toHaveBeenCalledWith(plain, NOW);
    });

    it('выбрал именно это занятие — сообщение приходит', async () => {
      const id = await student('Ваня');
      const thisClass = await createClass();
      const otherClass = await createClass({ title: 'Тайцзи' });
      await cancelledLesson(thisClass._id);
      await new LessonScopeService(prefsModel).set(id, {
        mode: 'selected',
        classIds: [otherClass._id.toString(), thisClass._id.toString()],
      });
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 1 });

      expect(await rowsOf(id)).toHaveLength(1);
    });

    it('«выбранные» без единой галочки — ни о каких', async () => {
      const id = await student('Ваня');
      const cls = await createClass();
      await cancelledLesson(cls._id);
      await new LessonScopeService(prefsModel).set(id, {
        mode: 'selected',
        classIds: [],
      });
      const { service, push } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });

      expect(push.sendToUser).not.toHaveBeenCalled();
    });
  });

  describe('какие занятия объявляются', () => {
    it('занятие уже началось или прошло — не объявляется: отмена задним числом ничего не скажет', async () => {
      await student('Ваня');
      const cls = await createClass();
      await cancelledLesson(cls._id, { startsAt: NOW.minus({ minutes: 5 }).toJSDate() });
      await cancelledLesson(cls._id, { startsAt: NOW.toJSDate() });
      const { service, push } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });

      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    it('отмена старше окна — не объявляется; ровно на границе окна — ещё да', async () => {
      const id = await student('Ваня');
      const cls = await createClass();
      const edge = NOW.minus({ hours: CANCEL_NOTICE_WINDOW_HOURS });
      await cancelledLesson(cls._id, {
        cancelledAt: edge.minus({ minutes: 1 }).toJSDate(),
      });
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });

      await cancelledLesson(cls._id, { cancelledAt: edge.toJSDate() });
      expect(await service.announce(NOW)).toEqual({ notified: 1 });
      expect(await rowsOf(id)).toHaveLength(1);
    });

    it('занятие, отменённое до появления cancelledAt, не объявляется задним числом', async () => {
      await student('Ваня');
      const cls = await createClass();
      const legacy = await lessonModel.create({
        classId: cls._id,
        startsAt: NOW.plus({ days: STARTS_IN_DAYS }).toJSDate(),
        durationMin: 60,
        topic: 'цигун',
        status: 'cancelled',
      });
      const { service, push } = build();

      expect(legacy.cancelledAt).toBeUndefined();
      expect(await service.announce(NOW)).toEqual({ notified: 0 });
      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    it('занятие вернули в расписание (scheduled) — не объявляется, даже если отметка осталась', async () => {
      await student('Ваня');
      const cls = await createClass();
      await cancelledLesson(cls._id, { status: 'scheduled' });
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });
    });

    it('класс выключен — сообщать не о чем', async () => {
      await student('Ваня');
      const cls = await createClass({ active: false });
      await cancelledLesson(cls._id);
      const { service, push } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });
      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    it('нет активных учеников — notified: 0, без ошибки', async () => {
      const cls = await createClass();
      await cancelledLesson(cls._id);
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });
    });

    it('несколько отмен — каждому человеку по строке на занятие', async () => {
      const id = await student('Ваня');
      const cls = await createClass();
      await cancelledLesson(cls._id);
      await cancelledLesson(cls._id, {
        startsAt: NOW.plus({ days: STARTS_IN_DAYS + 1 }).toJSDate(),
      });
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 2 });

      expect(await rowsOf(id)).toHaveLength(2);
    });
  });

  describe('идемпотентность (уникальный индекс, не флаг в памяти)', () => {
    it('второй тик не дублирует ни строки, ни push', async () => {
      const id = await student('Ваня');
      const cls = await createClass();
      await cancelledLesson(cls._id);
      const { service, push } = build();

      await service.announce(NOW);
      const second = await service.announce(NOW.plus({ minutes: 1 }));

      expect(second).toEqual({ notified: 0 });
      expect(await rowsOf(id)).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenCalledTimes(1);
    });

    it('два announce() одновременно (два инстанса при деплое) — по одной строке и одному push на человека', async () => {
      const first = await student('Ваня');
      const second = await student('Маша');
      const cls = await createClass();
      await cancelledLesson(cls._id);
      const push = fakePush();
      const a = build(push).service;
      const b = build(push).service;

      const [resultA, resultB] = await Promise.all([a.announce(NOW), b.announce(NOW)]);

      expect(resultA.notified + resultB.notified).toBe(2);
      expect(await rowsOf(first)).toHaveLength(1);
      expect(await rowsOf(second)).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenCalledTimes(2);
    });

    it('напоминание «Занятие скоро» об этом же занятии отмену не блокирует: вид входит в ключ', async () => {
      const id = await student('Ваня');
      const cls = await createClass();
      const lesson = await cancelledLesson(cls._id);
      await notificationModel.create({
        userId: id,
        kind: 'lesson_soon',
        lessonId: lesson._id.toString(),
        lessonTitle: 'Цигун для глаз',
        readAt: null,
      });
      const { service, push } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 1 });

      expect(await rowsOf(id, 'lesson_soon')).toHaveLength(1);
      expect(await rowsOf(id)).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenCalledTimes(1);
    });

    it('прочитанная и убранная строка не воскресает: повторного сообщения нет', async () => {
      const id = await student('Ваня');
      const cls = await createClass();
      const lesson = await cancelledLesson(cls._id);
      const readAt = NOW.minus({ minutes: 20 }).toJSDate();
      const dismissedAt = NOW.minus({ minutes: 10 }).toJSDate();
      await notificationModel.create({
        userId: id,
        kind: 'lesson_cancelled',
        lessonId: lesson._id.toString(),
        lessonTitle: 'Цигун для глаз',
        readAt,
        dismissedAt,
      });
      const { service, push } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });

      const [row] = await rowsOf(id);
      expect(row?.readAt).toEqual(readAt);
      expect(row?.dismissedAt).toEqual(dismissedAt);
      expect(push.sendToUser).not.toHaveBeenCalled();
    });
  });

  describe('сбой у одного человека', () => {
    it('запись упала — error со стеком, остальные получили, а следующий тик догоняет упавшего', async () => {
      const broken = await student('Сбойный');
      const fine = await student('Исправный');
      const cls = await createClass();
      await cancelledLesson(cls._id);
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const create = notificationModel.create.bind(notificationModel) as (
        doc: object,
      ) => Promise<unknown>;
      jest
        .spyOn(notificationModel, 'create')
        .mockImplementation(((doc: { userId?: string }) =>
          doc.userId === broken
            ? Promise.reject(new Error('сбой записи'))
            : create(doc)) as never);
      const { service, push } = build();

      try {
        expect(await service.announce(NOW)).toEqual({ notified: 1 });
      } finally {
        jest.restoreAllMocks();
      }

      expect(await rowsOf(fine)).toHaveLength(1);
      expect(await rowsOf(broken)).toEqual([]);
      expect(push.sendToUser).toHaveBeenCalledTimes(1);
      expect(push.sendToUser).toHaveBeenCalledWith(fine, NOW);
      expect(logged).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls[0]?.[0]).toContain(broken);
      expect(logged.mock.calls[0]?.[1]).toContain('сбой записи');

      // Повтор в окне — ради него шаг и идёт тиком, а не внутри PATCH.
      expect(await service.announce(NOW.plus({ minutes: 1 }))).toEqual({ notified: 1 });
      expect(await rowsOf(broken)).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenLastCalledWith(broken, NOW.plus({ minutes: 1 }));
    });

    it('упавший push тоже не останавливает остальных, а строка остаётся', async () => {
      const first = await student('Ваня');
      const second = await student('Маша');
      const cls = await createClass();
      await cancelledLesson(cls._id);
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const push = fakePush();
      push.sendToUser.mockImplementation((userId: string) =>
        userId === first ? Promise.reject(new Error('push упал')) : Promise.resolve(1),
      );
      const { service } = build(push);

      try {
        expect(await service.announce(NOW)).toEqual({ notified: 1 });
      } finally {
        jest.restoreAllMocks();
      }

      expect(await rowsOf(first)).toHaveLength(1);
      expect(await rowsOf(second)).toHaveLength(1);
      expect(logged).toHaveBeenCalledTimes(1);
    });
  });
});
