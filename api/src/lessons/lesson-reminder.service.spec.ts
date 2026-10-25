// Против настоящей Mongo (CLAUDE.md «Тесты», образец —
// recording-prompt.service.spec.ts): «напомнили» — строка ленты с уникальным
// индексом (userId, kind, lessonId), а не отметка на занятии (ADR-0162, п. 3);
// у каждого человека своё «за сколько минут», окно занятий — по самому
// раннему; read-after-write строки ленты и переключатель уведомления через
// настоящий NotificationPrefsService (не мок — иначе не поймать, что дефолт
// ученика включён без единого переключения руками, ADR-0135). О каких занятиях
// напоминать — решает только выбор напоминаний (ADR-0185): без него не
// напоминает никому, выбор «о каких занятиях» (ADR-0162) на него не влияет.
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Connection, Model, Types } from 'mongoose';
import type { SettingsDto } from '@xuanxue/shared';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { writeOwnReminderMinutes } from '../test-support/own-reminder-minutes';
import {
  NotificationPrefsRecord,
  NotificationPrefsSchema,
} from '../notifications/notification-prefs.schema';
import { LessonRecipientsService } from '../notifications/lesson-recipients.service';
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
      new LessonRecipientsService(
        userModel,
        new NotificationPrefsService(prefsModel),
        new LessonScopeService(prefsModel),
      ),
      settings,
      push as unknown as PushSenderService,
    );
    return { service, push };
  }

  /** Выбор напоминаний человека — так же, как его записывает синхронизация
   * (ADR-0185): классы и отдельные занятия строками. */
  function choose(
    userId: string,
    {
      classes = [],
      lessons = [],
    }: { classes?: Types.ObjectId[]; lessons?: Types.ObjectId[] },
  ) {
    return prefsModel.updateOne(
      { userId },
      {
        $set: {
          reminderClassIds: classes.map(String),
          reminderLessonIds: lessons.map(String),
        },
      },
      { upsert: true },
    );
  }

  /** Класс, о котором напоминать выбрали все уже заведённые люди: для тестов
   * про «за сколько», окно и доставку, где выбор занятий не предмет проверки.
   * Людей заводят до класса. */
  async function createChosenClass(overrides: Partial<ClassRecord> = {}) {
    const cls = await createClass(overrides);
    const users = await userModel.find({}, { _id: 1 }).lean();
    await Promise.all(
      users.map(({ _id }) =>
        prefsModel.updateOne(
          { userId: _id.toString() },
          { $addToSet: { reminderClassIds: cls._id.toString() } },
          { upsert: true },
        ),
      ),
    );
    return cls;
  }

  it('дефолт ученика включён без переключения (ADR-0135) — занятие выбранного класса в окне пишет ленту и шлёт push', async () => {
    const student = await userModel.create({ name: 'Ваня', roles: [], status: 'active' });
    const cls = await createClass();
    await choose(student._id.toString(), { classes: [cls._id] });
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
  });

  // ADR-0185: «Занятие скоро» идёт по выбору напоминаний — классы и отдельные
  // занятия. Выбор «о каких занятиях» (ADR-0162) на него не влияет.
  describe('выбор напоминаний (ADR-0185)', () => {
    async function scheduleAt(classId: Types.ObjectId, minutes = 30) {
      return lessonModel.create({
        classId,
        startsAt: NOW.plus({ minutes }).toJSDate(),
        durationMin: 60,
        topic: 'цигун',
        status: 'scheduled',
      });
    }

    async function newStudent(name = 'Ваня'): Promise<string> {
      const user = await userModel.create({ name, roles: [], status: 'active' });
      return user._id.toString();
    }

    function inboxRowsOf(userId: string) {
      return notificationModel.find({ userId, kind: 'lesson_soon' }).lean();
    }

    it('выбранный класс: напоминание приходит один раз, второй тик дубля не даёт', async () => {
      const id = await newStudent();
      const cls = await createClass();
      await choose(id, { classes: [cls._id] });
      await scheduleAt(cls._id);
      const { service, push } = build();

      expect(await service.remind(NOW)).toEqual({ reminded: 1 });
      expect(await service.remind(NOW.plus({ minutes: 1 }))).toEqual({ reminded: 0 });

      expect(await inboxRowsOf(id)).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenCalledTimes(1);
    });

    it('выбранное отдельное занятие: о нём приходит, о другом занятии того же класса нет', async () => {
      const id = await newStudent();
      const cls = await createClass();
      const chosen = await scheduleAt(cls._id);
      await scheduleAt(cls._id, 40);
      await choose(id, { lessons: [chosen._id] });
      const { service } = build();

      expect(await service.remind(NOW)).toEqual({ reminded: 1 });

      const rows = await inboxRowsOf(id);
      expect(rows.map((r) => r.lessonId)).toEqual([chosen._id.toString()]);
    });

    it('класс и его занятие выбраны сразу — одно напоминание, а не два', async () => {
      const id = await newStudent();
      const cls = await createClass();
      const lesson = await scheduleAt(cls._id);
      await choose(id, { classes: [cls._id], lessons: [lesson._id] });
      const { service, push } = build();

      expect(await service.remind(NOW)).toEqual({ reminded: 1 });

      expect(await inboxRowsOf(id)).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenCalledTimes(1);
    });

    it('выбор объединяется: класс и занятие другого класса — оба, третье занятие нет', async () => {
      const id = await newStudent();
      const first = await createClass();
      const second = await createClass({ title: 'Тайцзи' });
      const third = await createClass({ title: 'Бэйфан' });
      await scheduleAt(first._id);
      const single = await scheduleAt(second._id);
      await scheduleAt(third._id);
      await choose(id, { classes: [first._id], lessons: [single._id] });
      const { service } = build();

      expect(await service.remind(NOW)).toEqual({ reminded: 2 });
    });

    it('нет документа настроек — напоминаний нет: «обо всех» больше не умолчание', async () => {
      const id = await newStudent();
      const cls = await createClass();
      await scheduleAt(cls._id);
      const { service, push } = build();

      expect(await service.remind(NOW)).toEqual({ reminded: 0 });

      expect(await inboxRowsOf(id)).toEqual([]);
      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    it('ни у кого нет выбора — занятия из базы не читаются вовсе', async () => {
      await newStudent();
      const cls = await createClass();
      await scheduleAt(cls._id);
      const find = jest.spyOn(lessonModel, 'find');
      const { service } = build();

      try {
        expect(await service.remind(NOW)).toEqual({ reminded: 0 });
        expect(find).not.toHaveBeenCalled();
      } finally {
        find.mockRestore();
      }
    });

    it('окно занятий строится только по людям с выбором: «за 120» без выбора его не расширяет', async () => {
      const chooser = await newStudent('Ваня');
      const early = await newStudent('Маша');
      const cls = await createClass();
      await scheduleAt(cls._id, 90);
      await choose(chooser, { classes: [cls._id] });
      await writeOwnReminderMinutes(prefsModel, early, 120);
      const find = jest.spyOn(lessonModel, 'find');
      const { service } = build();

      try {
        expect(await service.remind(NOW)).toEqual({ reminded: 0 });
        const filter = find.mock.calls[0]?.[0] as unknown as {
          startsAt: { $lte: Date };
        };
        expect(filter.startsAt.$lte).toEqual(NOW.plus({ minutes: 60 }).toJSDate());
      } finally {
        find.mockRestore();
      }
      expect(await inboxRowsOf(early)).toEqual([]);
    });

    it('выбор опустошён (пустые списки) — напоминаний нет', async () => {
      const id = await newStudent();
      const cls = await createClass();
      await scheduleAt(cls._id);
      await choose(id, {});
      const { service } = build();

      expect(await service.remind(NOW)).toEqual({ reminded: 0 });
      expect(await inboxRowsOf(id)).toEqual([]);
    });

    it('у каждого свой выбор: выбравший другой класс не получает, выбравший этот получает', async () => {
      const picky = await newStudent('Ваня');
      const plain = await newStudent('Маша');
      const thisClass = await createClass();
      const otherClass = await createClass({ title: 'Тайцзи' });
      await scheduleAt(thisClass._id);
      await choose(picky, { classes: [otherClass._id] });
      await choose(plain, { classes: [thisClass._id] });
      const { service, push } = build();

      expect(await service.remind(NOW)).toEqual({ reminded: 1 });

      expect(await inboxRowsOf(picky)).toEqual([]);
      expect(await inboxRowsOf(plain)).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenCalledWith(plain, NOW);
    });

    it('вид lesson_soon выключен — ни ленты, ни push, даже с выбором', async () => {
      const id = await newStudent();
      const cls = await createClass();
      await scheduleAt(cls._id);
      await choose(id, { classes: [cls._id] });
      await new NotificationPrefsService(prefsModel).set(id, 'lesson_soon', false);
      const { service, push } = build();

      expect(await service.remind(NOW)).toEqual({ reminded: 0 });
      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    // Выбор «о каких занятиях» — для отмены, записи и материалов (ADR-0162).
    describe('старый выбор «о каких занятиях» напоминание не меняет', () => {
      it('«все» без выбора напоминаний — напоминаний нет', async () => {
        const id = await newStudent();
        const cls = await createClass();
        await scheduleAt(cls._id);
        await new LessonScopeService(prefsModel).set(id, { mode: 'all', classIds: [] });
        const { service } = build();

        expect(await service.remind(NOW)).toEqual({ reminded: 0 });
        expect(await inboxRowsOf(id)).toEqual([]);
      });

      it('«выбранные» с этим классом, но без выбора напоминаний — напоминаний нет', async () => {
        const id = await newStudent();
        const cls = await createClass();
        await scheduleAt(cls._id);
        await new LessonScopeService(prefsModel).set(id, {
          mode: 'selected',
          classIds: [cls._id.toString()],
        });
        const { service } = build();

        expect(await service.remind(NOW)).toEqual({ reminded: 0 });
        expect(await inboxRowsOf(id)).toEqual([]);
      });

      it('«выбранные» без этого класса, но с выбором напоминаний — напоминание приходит', async () => {
        const id = await newStudent();
        const cls = await createClass();
        const other = await createClass({ title: 'Тайцзи' });
        await scheduleAt(cls._id);
        await new LessonScopeService(prefsModel).set(id, {
          mode: 'selected',
          classIds: [other._id.toString()],
        });
        await choose(id, { classes: [cls._id] });
        const { service } = build();

        expect(await service.remind(NOW)).toEqual({ reminded: 1 });
        expect(await inboxRowsOf(id)).toHaveLength(1);
      });

      it('«выбранные» без единой галочки, но с выбором напоминаний — напоминание приходит', async () => {
        const id = await newStudent();
        const cls = await createClass();
        await scheduleAt(cls._id);
        const scopes = new LessonScopeService(prefsModel);
        await scopes.set(id, { mode: 'selected', classIds: [] });
        await choose(id, { classes: [cls._id] });
        const { service } = build();

        expect(await service.remind(NOW)).toEqual({ reminded: 1 });
      });
    });

    describe('отмена, перенос, восстановление', () => {
      it('отменённое занятие не напоминает, восстановленное — напоминает (тот же _id)', async () => {
        const id = await newStudent();
        const cls = await createClass();
        await choose(id, { classes: [cls._id] });
        const lesson = await scheduleAt(cls._id);
        await lessonModel.updateOne({ _id: lesson._id }, { status: 'cancelled' });
        const { service } = build();

        expect(await service.remind(NOW)).toEqual({ reminded: 0 });

        await lessonModel.updateOne({ _id: lesson._id }, { status: 'scheduled' });
        expect(await service.remind(NOW.plus({ minutes: 1 }))).toEqual({ reminded: 1 });
        expect((await inboxRowsOf(id)).map((r) => r.lessonId)).toEqual([
          lesson._id.toString(),
        ]);
      });

      it('перенесённое занятие (тот же _id) напоминает по новому времени', async () => {
        const id = await newStudent();
        const cls = await createClass();
        await choose(id, { lessons: [], classes: [cls._id] });
        const lesson = await scheduleAt(cls._id, 300);
        const { service } = build();
        expect(await service.remind(NOW)).toEqual({ reminded: 0 });

        const later = NOW.plus({ hours: 4 });
        await lessonModel.updateOne(
          { _id: lesson._id },
          { startsAt: later.plus({ minutes: 30 }).toJSDate() },
        );

        expect(await service.remind(later)).toEqual({ reminded: 1 });
      });

      it('занятие, о котором уже напомнили, после переноса второй раз не напоминает', async () => {
        const id = await newStudent();
        const cls = await createClass();
        await choose(id, { classes: [cls._id] });
        const lesson = await scheduleAt(cls._id);
        const { service } = build();
        expect(await service.remind(NOW)).toEqual({ reminded: 1 });

        const later = NOW.plus({ hours: 4 });
        await lessonModel.updateOne(
          { _id: lesson._id },
          { startsAt: later.plus({ minutes: 30 }).toJSDate() },
        );

        expect(await service.remind(later)).toEqual({ reminded: 0 });
        expect(await inboxRowsOf(id)).toHaveLength(1);
      });
    });

    // ADR-0185: ноль — напомнить в момент начала, на первом тике из
    // [startsAt, startsAt + 60 с]; не раньше начала и не позже допуска.
    describe('нулевое «за сколько»', () => {
      async function zeroStudent() {
        const id = await newStudent();
        const cls = await createClass();
        await choose(id, { classes: [cls._id] });
        await writeOwnReminderMinutes(prefsModel, id, 0);
        return { id, cls };
      }

      async function startingAt(classId: Types.ObjectId, seconds: number) {
        return lessonModel.create({
          classId,
          startsAt: NOW.plus({ seconds }).toJSDate(),
          durationMin: 60,
          topic: 'цигун',
          status: 'scheduled',
        });
      }

      it('занятие началось только что — напоминает на этом тике, школьный час не подставляется', async () => {
        const { id, cls } = await zeroStudent();
        await startingAt(cls._id, 0);
        const { service, push } = build();

        expect(await service.remind(NOW)).toEqual({ reminded: 1 });

        expect(await inboxRowsOf(id)).toHaveLength(1);
        expect(push.sendToUser).toHaveBeenCalledWith(id, NOW);
      });

      it('за час до начала — тишина: ноль не равен школьным 60', async () => {
        const { id, cls } = await zeroStudent();
        await startingAt(cls._id, 3600);
        const { service } = build();

        expect(await service.remind(NOW)).toEqual({ reminded: 0 });
        expect(await inboxRowsOf(id)).toEqual([]);
      });

      it('за секунду до начала — рано, на тике ровно в начало — приходит', async () => {
        const { cls } = await zeroStudent();
        await startingAt(cls._id, 1);
        const { service } = build();

        expect(await service.remind(NOW)).toEqual({ reminded: 0 });
        expect(await service.remind(NOW.plus({ seconds: 1 }))).toEqual({ reminded: 1 });
      });

      it('через 60 секунд после начала ещё приходит, через 61 — нет и не догоняется', async () => {
        const { cls } = await zeroStudent();
        await startingAt(cls._id, -60);
        const late = await startingAt(cls._id, -61);
        const { service, push } = build();

        expect(await service.remind(NOW)).toEqual({ reminded: 1 });

        const rows = await notificationModel.find({ kind: 'lesson_soon' }).lean();
        expect(rows.map((r) => r.lessonId)).not.toContain(late._id.toString());
        expect(push.sendToUser).toHaveBeenCalledTimes(1);
      });

      it('положительное «за сколько» другого ученика не двигается: он получает за свои 60 минут', async () => {
        const { cls } = await zeroStudent();
        const sixty = await newStudent('Маша');
        await choose(sixty, { classes: [cls._id] });
        await startingAt(cls._id, 1800);
        const { service } = build();

        expect(await service.remind(NOW)).toEqual({ reminded: 1 });

        expect(await inboxRowsOf(sixty)).toHaveLength(1);
      });
    });
  });

  it('занятие вне окна (позже lessonReminderMinutes) — не напоминает', async () => {
    await userModel.create({ name: 'Ваня', roles: [], status: 'active' });
    const cls = await createChosenClass();
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

  it('занятие уже началось (startsAt <= now) — при положительном «за сколько» не напоминает', async () => {
    await userModel.create({ name: 'Ваня', roles: [], status: 'active' });
    const cls = await createChosenClass();
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

  it('класс выключен — не напоминает', async () => {
    await userModel.create({ name: 'Ваня', roles: [], status: 'active' });
    const cls = await createChosenClass({ active: false });
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
    // 2026-03-27, 02:00 IST → 03:00 IDT. На стене часов 01:30 → 03:30 — два
    // часа, на деле час: с выбором «за 60» пора, с выбором «за 30» ещё нет.
    const sixty = await userModel.create({ name: 'Ваня', roles: [], status: 'active' });
    const thirty = await userModel.create({ name: 'Маша', roles: [], status: 'active' });
    await writeOwnReminderMinutes(prefsModel, sixty._id.toString(), 60);
    await writeOwnReminderMinutes(prefsModel, thirty._id.toString(), 30);
    const cls = await createChosenClass();
    const now = DateTime.fromISO('2026-03-27T01:30:00', { zone: 'Asia/Jerusalem' });
    await lessonModel.create({
      classId: cls._id,
      startsAt: DateTime.fromISO('2026-03-27T03:30:00', {
        zone: 'Asia/Jerusalem',
      }).toJSDate(),
      durationMin: 60,
      topic: 'цигун',
      status: 'scheduled',
    });
    const { service, push } = build();

    expect(await service.remind(now)).toEqual({ reminded: 1 });

    expect(push.sendToUser).toHaveBeenCalledTimes(1);
    expect(push.sendToUser).toHaveBeenCalledWith(sixty._id.toString(), now);
  });

  // ADR-0162, п. 3: «за сколько» у каждого своё, а «уже напомнили» — строка
  // ленты человека, не отметка занятия.
  describe('личное «за сколько минут» и отметка по человеку (ADR-0162)', () => {
    async function scheduleIn(minutes: number, classId: Types.ObjectId) {
      return lessonModel.create({
        classId,
        startsAt: NOW.plus({ minutes }).toJSDate(),
        durationMin: 60,
        topic: 'цигун',
        status: 'scheduled',
      });
    }

    async function student(name: string, minutes?: number): Promise<string> {
      const user = await userModel.create({ name, roles: [], status: 'active' });
      const id = user._id.toString();
      if (minutes !== undefined) {
        await writeOwnReminderMinutes(prefsModel, id, minutes);
      }
      return id;
    }

    function rowsOf(userId: string) {
      return notificationModel.find({ userId, kind: 'lesson_soon' }).lean();
    }

    it('за 60 минут пора только тому, кто выбрал 120; за 10 — и тому, кто выбрал 15, без второй строки первому', async () => {
      const early = await student('Ранний', 120);
      const late = await student('Поздний', 15);
      const cls = await createChosenClass();
      const lesson = await scheduleIn(60, cls._id);
      const { service, push } = build();

      expect(await service.remind(NOW)).toEqual({ reminded: 1 });
      expect(await rowsOf(early)).toHaveLength(1);
      expect(await rowsOf(late)).toEqual([]);

      // Десять минут до начала: поздний дозрел, ранний уже получил своё.
      const later = NOW.plus({ minutes: 50 });
      expect(await service.remind(later)).toEqual({ reminded: 1 });

      expect(await rowsOf(early)).toHaveLength(1);
      expect(await rowsOf(late)).toHaveLength(1);
      expect((await rowsOf(late))[0]?.lessonId).toBe(lesson._id.toString());
      expect(push.sendToUser.mock.calls).toEqual([
        [early, NOW],
        [late, later],
      ]);
    });

    it('окно занятий берётся по самому раннему: за 90 минут школа (60) молчит, а выбравший 120 получает', async () => {
      const early = await student('Ранний', 120);
      const plain = await student('Обычный');
      const cls = await createChosenClass();
      await scheduleIn(90, cls._id);
      const { service } = build();

      expect(await service.remind(NOW)).toEqual({ reminded: 1 });

      expect(await rowsOf(early)).toHaveLength(1);
      expect(await rowsOf(plain)).toEqual([]);
    });

    it('снял свой выбор (вернулся к школьным 60) — напоминание приходит уже за школьный час', async () => {
      const id = await student('Ваня', 15);
      const cls = await createChosenClass();
      await scheduleIn(45, cls._id);
      const { service } = build();

      expect(await service.remind(NOW)).toEqual({ reminded: 0 });
      await writeOwnReminderMinutes(prefsModel, id, null);
      expect(await service.remind(NOW)).toEqual({ reminded: 1 });
    });

    it('второй тик не дублирует ни строки, ни push', async () => {
      const id = await student('Ваня');
      const cls = await createChosenClass();
      await scheduleIn(30, cls._id);
      const { service, push } = build();

      await service.remind(NOW);
      const second = await service.remind(NOW.plus({ minutes: 1 }));

      expect(second).toEqual({ reminded: 0 });
      expect(await rowsOf(id)).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenCalledTimes(1);
    });

    it('передумал 15 → 120 после напоминания — второй строки и второго push нет', async () => {
      const id = await student('Ваня', 15);
      const cls = await createChosenClass();
      await scheduleIn(10, cls._id);
      const { service, push } = build();
      expect(await service.remind(NOW)).toEqual({ reminded: 1 });

      await writeOwnReminderMinutes(prefsModel, id, 120);

      expect(await service.remind(NOW.plus({ minutes: 1 }))).toEqual({ reminded: 0 });
      expect(await rowsOf(id)).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenCalledTimes(1);
    });

    it('два remind() одновременно (два инстанса при деплое) — по одной строке и одному push на человека', async () => {
      const first = await student('Ваня');
      const second = await student('Маша');
      const cls = await createChosenClass();
      await scheduleIn(30, cls._id);
      const push = fakePush();
      const a = build(push).service;
      const b = build(push).service;

      const [resultA, resultB] = await Promise.all([a.remind(NOW), b.remind(NOW)]);

      expect(resultA.reminded + resultB.reminded).toBe(2);
      expect(await rowsOf(first)).toHaveLength(1);
      expect(await rowsOf(second)).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenCalledTimes(2);
    });

    it('строка, которую написал прежний код (отметка была на занятии), блокирует новую — деплой не шлёт дубль', async () => {
      const id = await student('Ваня');
      const cls = await createChosenClass();
      const lesson = await scheduleIn(30, cls._id);
      await notificationModel.create({
        userId: id,
        kind: 'lesson_soon',
        lessonId: lesson._id.toString(),
        lessonTitle: 'Цигун для глаз',
        readAt: null,
      });
      const { service, push } = build();

      expect(await service.remind(NOW)).toEqual({ reminded: 0 });

      expect(await rowsOf(id)).toHaveLength(1);
      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    it('прочитанная и убранная строка не воскресает: повторного напоминания нет', async () => {
      const id = await student('Ваня');
      const cls = await createChosenClass();
      const lesson = await scheduleIn(30, cls._id);
      const readAt = NOW.minus({ minutes: 20 }).toJSDate();
      const dismissedAt = NOW.minus({ minutes: 10 }).toJSDate();
      await notificationModel.create({
        userId: id,
        kind: 'lesson_soon',
        lessonId: lesson._id.toString(),
        lessonTitle: 'Цигун для глаз',
        readAt,
        dismissedAt,
      });
      const { service } = build();

      await service.remind(NOW);

      const [row] = await rowsOf(id);
      expect(row?.readAt).toEqual(readAt);
      expect(row?.dismissedAt).toEqual(dismissedAt);
    });

    it('строка ленты несёт снимок названия и занятие; у одного занятия у двух людей — по своей строке', async () => {
      const first = await student('Ваня');
      const second = await student('Маша');
      const cls = await createChosenClass({ title: 'Тайцзи' });
      const lesson = await scheduleIn(30, cls._id);
      const { service } = build();

      await service.remind(NOW);

      for (const id of [first, second]) {
        const [row] = await rowsOf(id);
        expect(row?.lessonId).toBe(lesson._id.toString());
        // Название шифруется схемой ленты: в базе не открытый текст.
        expect(row?.lessonTitle).toBeDefined();
        expect(row?.lessonTitle).not.toBe('Тайцзи');
        expect(row?.readAt).toBeNull();
      }
    });

    it('несколько занятий в окне — каждому человеку по строке на занятие', async () => {
      const id = await student('Ваня');
      const cls = await createChosenClass();
      const other = await createChosenClass({ title: 'Тайцзи' });
      await scheduleIn(20, cls._id);
      await scheduleIn(40, other._id);
      await scheduleIn(90, cls._id);
      const { service } = build();

      expect(await service.remind(NOW)).toEqual({ reminded: 2 });

      expect(await rowsOf(id)).toHaveLength(2);
    });

    it('сбой записи у одного человека не останавливает остальных: error в логе со стеком, остальные получили', async () => {
      const broken = await student('Сбойный');
      const fine = await student('Исправный');
      const cls = await createChosenClass();
      await scheduleIn(30, cls._id);
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
        expect(await service.remind(NOW)).toEqual({ reminded: 1 });
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
    });

    it('упавший push тоже не останавливает остальных, а строка остаётся (напомнить повторно нельзя)', async () => {
      const first = await student('Ваня');
      const second = await student('Маша');
      const cls = await createChosenClass();
      await scheduleIn(30, cls._id);
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const push = fakePush();
      push.sendToUser.mockImplementation((userId: string) =>
        userId === first ? Promise.reject(new Error('push упал')) : Promise.resolve(1),
      );
      const { service } = build(push);

      try {
        expect(await service.remind(NOW)).toEqual({ reminded: 1 });
      } finally {
        jest.restoreAllMocks();
      }

      expect(await rowsOf(first)).toHaveLength(1);
      expect(await rowsOf(second)).toHaveLength(1);
      expect(logged).toHaveBeenCalledTimes(1);
    });
  });
});
