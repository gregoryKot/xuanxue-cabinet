// Против настоящей Mongo (CLAUDE.md «Тесты», образец — lesson-cancel-notice.service.spec.ts):
// «Запись занятия» — шаг тика (ADR-0162, п. 4). Учитель добавил запись, а ленту и
// push пишет этот шаг, и только тем ученикам, кто вид включил сам: он «по
// желанию», в дефолте его нет. Получатели — настоящие сервисы настроек (не мок):
// иначе не поймать, что вид выключен у ученика, который его не трогал.
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
import { LESSON_NOTICE_WINDOW_HOURS } from './lesson-notice-queries';
import { LessonRecord, LessonSchema } from './lesson.schema';
import { RecordingReadyNoticeService } from './recording-ready-notice.service';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const RECORDED_AT = NOW.minus({ minutes: 1 });
const STARTED_HOURS_AGO = 2;
const KIND: NotificationKind = 'recording_ready';

describe('RecordingReadyNoticeService.announce (ADR-0162)', () => {
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
    await lessonModel.syncIndexes();
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

  /** По умолчанию — занятие, которое закончилось два часа назад, запись к нему
   * добавили минуту назад. */
  function recordedLesson(
    classId: Types.ObjectId,
    overrides: Partial<LessonRecord> = {},
  ) {
    return lessonModel.create({
      classId,
      startsAt: NOW.minus({ hours: STARTED_HOURS_AGO }).toJSDate(),
      durationMin: 60,
      topic: 'цигун',
      status: 'scheduled',
      recordings: [{ title: 'Запись', url: 'https://example.com/rec' }],
      recordingReadyAt: RECORDED_AT.toJSDate(),
      ...overrides,
    });
  }

  /** Ученик, который включил «Запись занятия» (если `enabled` не выключен). */
  async function student(name: string, enabled = true): Promise<string> {
    const user = await userModel.create({ name, roles: [], status: 'active' });
    const id = user._id.toString();
    if (enabled) await new NotificationPrefsService(prefsModel).set(id, KIND, true);
    return id;
  }

  function rowsOf(userId: string, kind: NotificationKind = KIND) {
    return notificationModel.find({ userId, kind }).lean();
  }

  function fakePush(): { sendToUser: jest.Mock } {
    return { sendToUser: jest.fn().mockResolvedValue(1) };
  }

  function build(push = fakePush()) {
    const service = new RecordingReadyNoticeService(
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

  it('включивший ученик: запись добавили — строка ленты с началом занятия и push', async () => {
    const id = await student('Ваня');
    const cls = await createClass({ title: 'Тайцзи' });
    const lesson = await recordedLesson(cls._id);
    const { service, push } = build();

    expect(await service.announce(NOW)).toEqual({ notified: 1 });

    expect(push.sendToUser).toHaveBeenCalledWith(id, NOW);
    const [row] = await rowsOf(id);
    expect(row?.lessonId).toBe(lesson._id.toString());
    expect(row?.lessonStartsAt).toEqual(
      NOW.minus({ hours: STARTED_HOURS_AGO }).toJSDate(),
    );
    expect(row?.readAt).toBeNull();
    // Название класса — снимок, зашифрованный схемой ленты, а не открытый текст.
    expect(row?.lessonTitle).not.toBe('Тайцзи');
    expect(decryptRecord(row ?? {}, NOTIFICATION_ENCRYPT_SCHEMA)).toMatchObject({
      lessonTitle: 'Тайцзи',
    });
  });

  // ADR-0162: «до 16 записей в неделю сверх 16 напоминаний» — потому и выкл.
  it('ученик, не включавший вид, не получает ни ленты, ни push; включивший рядом — получает', async () => {
    const quiet = await student('Маша', false);
    const eager = await student('Ваня');
    const cls = await createClass();
    await recordedLesson(cls._id);
    const { service, push } = build();

    expect(await service.announce(NOW)).toEqual({ notified: 1 });

    expect(await rowsOf(quiet)).toEqual([]);
    expect(await rowsOf(eager)).toHaveLength(1);
    expect(push.sendToUser).toHaveBeenCalledTimes(1);
    expect(push.sendToUser).toHaveBeenCalledWith(eager, NOW);
  });

  it('включил и выключил обратно — не получает', async () => {
    const id = await student('Ваня');
    await new NotificationPrefsService(prefsModel).set(id, KIND, false);
    const cls = await createClass();
    await recordedLesson(cls._id);
    const { service, push } = build();

    expect(await service.announce(NOW)).toEqual({ notified: 0 });

    expect(await rowsOf(id)).toEqual([]);
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('включил вид уже после записи, но в окне повторов — следующий тик догоняет', async () => {
    const id = await student('Ваня', false);
    const cls = await createClass();
    await recordedLesson(cls._id);
    const { service, push } = build();
    expect(await service.announce(NOW)).toEqual({ notified: 0 });

    await new NotificationPrefsService(prefsModel).set(id, KIND, true);
    expect(await service.announce(NOW.plus({ minutes: 5 }))).toEqual({ notified: 1 });

    expect(await rowsOf(id)).toHaveLength(1);
    expect(push.sendToUser).toHaveBeenCalledTimes(1);
  });

  it('штат школы не получает, даже если вид у него включён руками: «Запись занятия» — ученический', async () => {
    const teacher = await userModel.create({
      name: 'Учитель',
      roles: ['teacher'],
      status: 'active',
    });
    await new NotificationPrefsService(prefsModel).set(
      teacher._id.toString(),
      KIND,
      true,
    );
    const cls = await createClass();
    await recordedLesson(cls._id);
    const { service, push } = build();

    expect(await service.announce(NOW)).toEqual({ notified: 0 });

    expect(await rowsOf(teacher._id.toString())).toEqual([]);
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('заблокированный ученик не получает', async () => {
    const user = await userModel.create({ name: 'Ваня', roles: [], status: 'blocked' });
    await new NotificationPrefsService(prefsModel).set(user._id.toString(), KIND, true);
    const cls = await createClass();
    await recordedLesson(cls._id);
    const { service } = build();

    expect(await service.announce(NOW)).toEqual({ notified: 0 });
  });

  // ADR-0162: человек сам выбирает, о каких занятиях ему сообщать.
  describe('выбор «о каких занятиях»', () => {
    it('выбрал другое занятие — по этому ни ленты, ни push', async () => {
      const picky = await student('Ваня');
      const thisClass = await createClass({ title: 'Цигун для глаз' });
      const otherClass = await createClass({ title: 'Тайцзи' });
      await recordedLesson(thisClass._id);
      await new LessonScopeService(prefsModel).set(picky, {
        mode: 'selected',
        classIds: [otherClass._id.toString()],
      });
      const { service, push } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });

      expect(await rowsOf(picky)).toEqual([]);
      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    it('выбрал именно это занятие — запись приходит', async () => {
      const id = await student('Ваня');
      const thisClass = await createClass();
      const otherClass = await createClass({ title: 'Тайцзи' });
      await recordedLesson(thisClass._id);
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
      await recordedLesson(cls._id);
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
    it('отменённое занятие с записью не объявляется', async () => {
      await student('Ваня');
      const cls = await createClass();
      await recordedLesson(cls._id, { status: 'cancelled' });
      const { service, push } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });
      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    it('класс выключен — сообщать не о чем', async () => {
      await student('Ваня');
      const cls = await createClass({ active: false });
      await recordedLesson(cls._id);
      const { service, push } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });
      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    it('запись старше окна не объявляется; ровно на границе окна — ещё да', async () => {
      const id = await student('Ваня');
      const cls = await createClass();
      const edge = NOW.minus({ hours: LESSON_NOTICE_WINDOW_HOURS });
      await recordedLesson(cls._id, {
        recordingReadyAt: edge.minus({ minutes: 1 }).toJSDate(),
      });
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });

      await recordedLesson(cls._id, {
        startsAt: NOW.minus({ hours: STARTED_HOURS_AGO + 1 }).toJSDate(),
        recordingReadyAt: edge.toJSDate(),
      });
      expect(await service.announce(NOW)).toEqual({ notified: 1 });
      expect(await rowsOf(id)).toHaveLength(1);
    });

    it('занятие с записями, добавленными до появления recordingReadyAt, не объявляется задним числом', async () => {
      await student('Ваня');
      const cls = await createClass();
      const legacy = await recordedLesson(cls._id, { recordingReadyAt: undefined });
      const { service, push } = build();

      expect(legacy.recordingReadyAt).toBeUndefined();
      expect(legacy.recordings).toHaveLength(1);
      expect(await service.announce(NOW)).toEqual({ notified: 0 });
      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    it('занятие ещё не началось — не объявляется: в «Записях занятий» его пока нет', async () => {
      await student('Ваня');
      const cls = await createClass();
      await recordedLesson(cls._id, { startsAt: NOW.plus({ minutes: 5 }).toJSDate() });
      const { service, push } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });
      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    it('нет активных учеников — notified: 0, без ошибки', async () => {
      const cls = await createClass();
      await recordedLesson(cls._id);
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });
    });

    it('несколько занятий с записью — каждому человеку по строке на занятие', async () => {
      const id = await student('Ваня');
      const cls = await createClass();
      await recordedLesson(cls._id);
      await recordedLesson(cls._id, {
        startsAt: NOW.minus({ hours: STARTED_HOURS_AGO + 24 }).toJSDate(),
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
      await recordedLesson(cls._id);
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
      await recordedLesson(cls._id);
      const push = fakePush();
      const a = build(push).service;
      const b = build(push).service;

      const [resultA, resultB] = await Promise.all([a.announce(NOW), b.announce(NOW)]);

      expect(resultA.notified + resultB.notified).toBe(2);
      expect(await rowsOf(first)).toHaveLength(1);
      expect(await rowsOf(second)).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenCalledTimes(2);
    });

    it('«Занятие скоро» и «Занятие отменено» об этом же занятии запись не блокируют: вид входит в ключ', async () => {
      const id = await student('Ваня');
      const cls = await createClass();
      const lesson = await recordedLesson(cls._id);
      for (const kind of ['lesson_soon', 'lesson_cancelled'] as const) {
        await notificationModel.create({
          userId: id,
          kind,
          lessonId: lesson._id.toString(),
          lessonTitle: 'Цигун для глаз',
          readAt: null,
        });
      }
      const { service, push } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 1 });

      expect(await rowsOf(id, 'lesson_soon')).toHaveLength(1);
      expect(await rowsOf(id, 'lesson_cancelled')).toHaveLength(1);
      expect(await rowsOf(id)).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenCalledTimes(1);
    });

    it('прочитанная и убранная строка не воскресает: повторного сообщения нет', async () => {
      const id = await student('Ваня');
      const cls = await createClass();
      const lesson = await recordedLesson(cls._id);
      const readAt = NOW.minus({ minutes: 20 }).toJSDate();
      const dismissedAt = NOW.minus({ minutes: 10 }).toJSDate();
      await notificationModel.create({
        userId: id,
        kind: KIND,
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
      await recordedLesson(cls._id);
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
      expect(logged.mock.calls[0]?.[0]).toContain('о записи занятия');
      expect(logged.mock.calls[0]?.[0]).toContain(broken);
      expect(logged.mock.calls[0]?.[1]).toContain('сбой записи');

      // Повтор в окне — ради него шаг и идёт тиком, а не внутри запроса учителя.
      expect(await service.announce(NOW.plus({ minutes: 1 }))).toEqual({ notified: 1 });
      expect(await rowsOf(broken)).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenLastCalledWith(broken, NOW.plus({ minutes: 1 }));
    });
  });
});
