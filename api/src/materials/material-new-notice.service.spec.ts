// Против настоящей Mongo (CLAUDE.md «Тесты», образец — recording-ready-notice.service.spec.ts):
// «Новый материал» — шаг тика (ADR-0162, п. 4). Учитель создал материал с галочкой
// «Сообщить ученикам», а ленту и push пишет этот шаг, и только тем ученикам, кто вид
// включил сам (он «по желанию») и кого материал касается по занятиям и тегам.
// Получатели — настоящие сервисы настроек (не мок): иначе не поймать, что вид
// выключен у ученика, который его не трогал. Материалы заводит та же функция, что и
// MaterialsService.create, — выборка шага читает то, что записало создание.
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { CreateMaterialInput, NotificationKind } from '@xuanxue/shared';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { LESSON_NOTICE_WINDOW_HOURS } from '../lessons/lesson-notice-queries';
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
import { UserRecord, UserSchema } from '../users/user.schema';
import { decryptRecord } from '../utils/encryption';
import { MaterialNewNoticeService } from './material-new-notice.service';
import { MaterialRecord, MaterialSchema } from './material.schema';
import { buildMaterialCreateRecord } from './materials.create';

const NOW = DateTime.fromISO('2026-10-01T09:00:00Z', { zone: 'utc' });
const ANNOUNCED_AT = NOW.minus({ minutes: 1 });
const AUTHOR_ID = '65f1c0ffee0000000000a001';
const KIND: NotificationKind = 'material_new';

describe('MaterialNewNoticeService.announce (ADR-0162)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let materialModel: Model<MaterialRecord>;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;
  let notificationModel: Model<NotificationRecord>;
  let userModel: Model<UserRecord>;
  let prefsModel: Model<NotificationPrefsRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    materialModel = connection.model<MaterialRecord>(MaterialRecord.name, MaterialSchema);
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
      materialModel.deleteMany({}),
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

  /** По умолчанию — общий материал со ссылкой, который отметили минуту назад. */
  function material(
    input: Partial<CreateMaterialInput> = {},
    announcedAt: DateTime = ANNOUNCED_AT,
  ) {
    return materialModel.create(
      buildMaterialCreateRecord(
        {
          title: 'Ван Пэйшэн, «Ба-гуа-чжан»',
          url: 'https://example.com/book',
          kind: 'book',
          notifyStudents: true,
          ...input,
        },
        AUTHOR_ID,
        announcedAt,
      ),
    );
  }

  /** Ученик, который включил «Новый материал» (если `enabled` не выключен). */
  async function student(name: string, enabled = true): Promise<string> {
    const user = await userModel.create({ name, roles: [], status: 'active' });
    const id = user._id.toString();
    if (enabled) await new NotificationPrefsService(prefsModel).set(id, KIND, true);
    return id;
  }

  function onlyClasses(userId: string, classIds: string[]) {
    return new LessonScopeService(prefsModel).set(userId, { mode: 'selected', classIds });
  }

  function rowsOf(userId: string, kind: NotificationKind = KIND) {
    return notificationModel.find({ userId, kind }).lean();
  }

  function fakePush(): { sendToUser: jest.Mock } {
    return { sendToUser: jest.fn().mockResolvedValue(1) };
  }

  function build(push = fakePush()) {
    const service = new MaterialNewNoticeService(
      materialModel,
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

  it('включивший ученик: общий материал — строка ленты с названием и push', async () => {
    const id = await student('Ваня');
    const created = await material();
    const { service, push } = build();

    expect(await service.announce(NOW)).toEqual({ notified: 1 });

    expect(push.sendToUser).toHaveBeenCalledWith(id, NOW);
    const [row] = await rowsOf(id);
    expect(row?.materialId).toBe(created._id.toString());
    expect(row?.readAt).toBeNull();
    // Название — снимок, зашифрованный схемой ленты, а не открытый текст.
    expect(row?.materialTitle).not.toBe('Ван Пэйшэн, «Ба-гуа-чжан»');
    expect(decryptRecord(row ?? {}, NOTIFICATION_ENCRYPT_SCHEMA)).toMatchObject({
      materialTitle: 'Ван Пэйшэн, «Ба-гуа-чжан»',
    });
  });

  // ADR-0162: «обо всех занятиях это до 16 записей в неделю» — потому и выкл.
  it('ученик, не включавший вид, не получает ни ленты, ни push; включивший рядом — получает', async () => {
    const quiet = await student('Маша', false);
    const eager = await student('Ваня');
    await material();
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
    await material();
    const { service, push } = build();

    expect(await service.announce(NOW)).toEqual({ notified: 0 });

    expect(await rowsOf(id)).toEqual([]);
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('включил вид уже после создания, но в окне повторов — следующий тик догоняет', async () => {
    const id = await student('Ваня', false);
    await material();
    const { service } = build();
    expect(await service.announce(NOW)).toEqual({ notified: 0 });

    await new NotificationPrefsService(prefsModel).set(id, KIND, true);
    expect(await service.announce(NOW.plus({ minutes: 5 }))).toEqual({ notified: 1 });

    expect(await rowsOf(id)).toHaveLength(1);
  });

  it('штат школы не получает, даже если вид у него включён руками: «Новый материал» — ученический', async () => {
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
    await material();
    const { service, push } = build();

    expect(await service.announce(NOW)).toEqual({ notified: 0 });

    expect(await rowsOf(teacher._id.toString())).toEqual([]);
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('заблокированный ученик не получает', async () => {
    const user = await userModel.create({ name: 'Ваня', roles: [], status: 'blocked' });
    await new NotificationPrefsService(prefsModel).set(user._id.toString(), KIND, true);
    await material();
    const { service } = build();

    expect(await service.announce(NOW)).toEqual({ notified: 0 });
  });

  describe('кому: занятия материала и выбор «о каких занятиях»', () => {
    it('общий материал (без привязок и тегов) приходит всем, в том числе «ни о каких занятиях»', async () => {
      const all = await student('Ваня');
      const nothing = await student('Маша');
      const picky = await student('Петя');
      const cls = await createClass();
      await onlyClasses(nothing, []);
      await onlyClasses(picky, [cls._id.toString()]);
      await material();
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 3 });

      for (const id of [all, nothing, picky]) expect(await rowsOf(id)).toHaveLength(1);
    });

    it('привязан к занятию (classIds): выбравший его и «все» получают, выбравший другое — нет', async () => {
      const everyone = await student('Ваня');
      const chosen = await student('Маша');
      const other = await student('Петя');
      const thisClass = await createClass({ title: 'Цигун для глаз' });
      const otherClass = await createClass({ title: 'Тайцзи' });
      await onlyClasses(chosen, [thisClass._id.toString()]);
      await onlyClasses(other, [otherClass._id.toString()]);
      await material({ classIds: [thisClass._id.toString()] });
      const { service, push } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 2 });

      expect(await rowsOf(everyone)).toHaveLength(1);
      expect(await rowsOf(chosen)).toHaveLength(1);
      expect(await rowsOf(other)).toEqual([]);
      expect(push.sendToUser).toHaveBeenCalledTimes(2);
    });

    it('«выбранные» без галочек не получают материал с занятием', async () => {
      const id = await student('Ваня');
      const cls = await createClass();
      await onlyClasses(id, []);
      await material({ classIds: [cls._id.toString()] });
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });
    });

    it('привязан к дате занятия (lessonIds): считается занятие расписания этой даты', async () => {
      const chosen = await student('Маша');
      const other = await student('Петя');
      const thisClass = await createClass({ title: 'Цигун для глаз' });
      const otherClass = await createClass({ title: 'Тайцзи' });
      const lesson = await lessonModel.create({
        classId: thisClass._id,
        startsAt: NOW.minus({ days: 1 }).toJSDate(),
        durationMin: 60,
        topic: 'цигун',
        status: 'scheduled',
      });
      await onlyClasses(chosen, [thisClass._id.toString()]);
      await onlyClasses(other, [otherClass._id.toString()]);
      await material({ lessonIds: [lesson._id.toString()] });
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 1 });

      expect(await rowsOf(chosen)).toHaveLength(1);
      expect(await rowsOf(other)).toEqual([]);
    });

    it('теги материала совпали с тегами занятия без учёта регистра: выбравший его получает, выбравший другое — нет', async () => {
      const chosen = await student('Маша');
      const other = await student('Петя');
      const beginners = await createClass({ title: 'Для новичков', tags: ['Новички'] });
      const advanced = await createClass({ title: 'Для опытных', tags: ['Опытные'] });
      await onlyClasses(chosen, [beginners._id.toString()]);
      await onlyClasses(other, [advanced._id.toString()]);
      await material({ tags: ['новички', 'книга'] });
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 1 });

      expect(await rowsOf(chosen)).toHaveLength(1);
      expect(await rowsOf(other)).toEqual([]);
    });

    it('тег совпал только с выключенным занятием — набор пуст, материал общий', async () => {
      const picky = await student('Петя');
      const live = await createClass({ title: 'Живое', tags: ['Другое'] });
      await createClass({ title: 'Закрытое', tags: ['Новички'], active: false });
      await onlyClasses(picky, [live._id.toString()]);
      await material({ tags: ['новички'] });
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 1 });
    });

    it('тег не совпал ни с одним занятием — материал общий, рубрика «книга» никого не отсекает', async () => {
      const id = await student('Ваня');
      const cls = await createClass({ tags: ['Новички'] });
      await onlyClasses(id, [cls._id.toString()]);
      await material({ tags: ['книга'] });
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 1 });
    });

    it('привязка и тег вместе: достаточно любого из занятий', async () => {
      const viaTag = await student('Маша');
      const viaBinding = await student('Петя');
      const none = await student('Коля');
      const tagged = await createClass({ title: 'По тегу', tags: ['Утро'] });
      const bound = await createClass({ title: 'По привязке' });
      const unrelated = await createClass({ title: 'Чужое' });
      await onlyClasses(viaTag, [tagged._id.toString()]);
      await onlyClasses(viaBinding, [bound._id.toString()]);
      await onlyClasses(none, [unrelated._id.toString()]);
      await material({ classIds: [bound._id.toString()], tags: ['утро'] });
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 2 });

      expect(await rowsOf(none)).toEqual([]);
    });
  });

  describe('какие материалы объявляются', () => {
    it('материал без announceAt (создан без галочки или до поля) не объявляется', async () => {
      await student('Ваня');
      await material({ notifyStudents: false });
      const { service, push } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });
      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    it('учитель успел перевести материал в «Только преподаватели» — на тике он уже не объявляется', async () => {
      await student('Ваня');
      const created = await material();
      await materialModel.updateOne({ _id: created._id }, { $set: { access: 'staff' } });
      const { service, push } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });
      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    it('материал удалён до тика — сообщать не о чем', async () => {
      await student('Ваня');
      const created = await material();
      await materialModel.deleteOne({ _id: created._id });
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });
    });

    it('старше окна повторов не объявляется; ровно на границе окна — ещё да', async () => {
      const id = await student('Ваня');
      const edge = NOW.minus({ hours: LESSON_NOTICE_WINDOW_HOURS });
      await material({}, edge.minus({ minutes: 1 }));
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });

      await material({ title: 'Другая книга' }, edge);
      expect(await service.announce(NOW)).toEqual({ notified: 1 });
      expect(await rowsOf(id)).toHaveLength(1);
    });

    // ADR-0134: открыть материал нечем, пока нет ни ссылки, ни файла — строка ленты,
    // за которой ученик ничего не найдёт, хуже её отсутствия.
    it('материал без ссылки и файла ждёт: объявляется, когда файл приложили', async () => {
      const id = await student('Ваня');
      const created = await material({ url: undefined });
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });

      await materialModel.updateOne(
        { _id: created._id },
        { $set: { fileKey: 'materials/x/y' } },
      );
      expect(await service.announce(NOW.plus({ minutes: 1 }))).toEqual({ notified: 1 });
      expect(await rowsOf(id)).toHaveLength(1);
    });

    it('несколько материалов — каждому человеку по строке на материал', async () => {
      const id = await student('Ваня');
      await material();
      await material({ title: 'Вторая книга' });
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 2 });

      expect(await rowsOf(id)).toHaveLength(2);
    });

    it('нет активных учеников — notified: 0, без ошибки', async () => {
      await material();
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 0 });
    });
  });

  describe('идемпотентность (уникальный индекс, не флаг в памяти)', () => {
    it('второй тик не дублирует ни строки, ни push', async () => {
      const id = await student('Ваня');
      await material();
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
      await material();
      const push = fakePush();
      const a = build(push).service;
      const b = build(push).service;

      const [resultA, resultB] = await Promise.all([a.announce(NOW), b.announce(NOW)]);

      expect(resultA.notified + resultB.notified).toBe(2);
      expect(await rowsOf(first)).toHaveLength(1);
      expect(await rowsOf(second)).toHaveLength(1);
      expect(push.sendToUser).toHaveBeenCalledTimes(2);
    });

    it('прочитанная и убранная строка не воскресает: повторного сообщения нет', async () => {
      const id = await student('Ваня');
      const created = await material();
      const readAt = NOW.minus({ minutes: 20 }).toJSDate();
      const dismissedAt = NOW.minus({ minutes: 10 }).toJSDate();
      await notificationModel.create({
        userId: id,
        kind: KIND,
        materialId: created._id.toString(),
        materialTitle: 'Ван Пэйшэн',
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

    // id материала и id занятия лежат в разных полях под разными индексами: строка
    // другого вида про то же значение материал не блокирует.
    it('строка другого вида того же человека материал не блокирует: вид входит в ключ', async () => {
      const id = await student('Ваня');
      const created = await material();
      await notificationModel.create({
        userId: id,
        kind: 'lesson_soon',
        lessonId: created._id.toString(),
        lessonTitle: 'Цигун для глаз',
        readAt: null,
      });
      const { service } = build();

      expect(await service.announce(NOW)).toEqual({ notified: 1 });

      expect(await rowsOf(id, 'lesson_soon')).toHaveLength(1);
      expect(await rowsOf(id)).toHaveLength(1);
    });
  });

  describe('сбой у одного человека', () => {
    it('запись упала — error со стеком, остальные получили, а следующий тик догоняет упавшего', async () => {
      const broken = await student('Сбойный');
      const fine = await student('Исправный');
      await material();
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
      expect(logged.mock.calls[0]?.[0]).toContain('о материале');
      expect(logged.mock.calls[0]?.[0]).toContain(broken);
      expect(logged.mock.calls[0]?.[1]).toContain('сбой записи');

      // Повтор в окне — ради него шаг и идёт тиком, а не внутри запроса учителя.
      expect(await service.announce(NOW.plus({ minutes: 1 }))).toEqual({ notified: 1 });
      expect(await rowsOf(broken)).toHaveLength(1);
    });
  });
});
