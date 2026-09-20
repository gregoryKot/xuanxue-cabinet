// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): фильтр «назад от now», отменённые прошедшие занятия видны со
// своим статусом, лимит по умолчанию и явный, класс не найден — дата
// пропущена (ТЗ docs/PLAN.md §14, «3.3. Архив занятий у ученика»). Материалы
// даты (слой 3.9, ADR-0056) — через настоящий LessonMaterialsService, не мок:
// join и правило доступа проверяет его собственный спек
// (lesson-materials.service.spec.ts), здесь — что архив зовёт его с id
// именно своего списка дат.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { LessonMaterialsService } from '../materials/lesson-materials.service';
import { MaterialRecord, MaterialSchema } from '../materials/material.schema';
import { MaterialsService } from '../materials/materials.service';
import { SettingsRecord, SettingsSchema } from '../settings/settings.schema';
import { SettingsService } from '../settings/settings.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { LessonRecord, LessonSchema } from './lesson.schema';
import { MyLessonsArchiveService } from './my-lessons-archive.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const NOW = DateTime.fromISO('2026-09-15T12:00:00Z', { zone: 'utc' });
const AUTHOR_ID = new Types.ObjectId().toString();

describe('MyLessonsArchiveService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;
  let materialModel: Model<MaterialRecord>;
  let materialsService: MaterialsService;
  let service: MyLessonsArchiveService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    materialModel = connection.model<MaterialRecord>(MaterialRecord.name, MaterialSchema);
    const settingsModel = connection.model<SettingsRecord>(
      SettingsRecord.name,
      SettingsSchema,
    );
    const userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    const settingsService = new SettingsService(
      settingsModel,
      lessonModel,
      classModel,
      new UsersService(userModel),
    );
    materialsService = new MaterialsService(materialModel, classModel, settingsService);
    const lessonMaterialsService = new LessonMaterialsService(
      materialModel,
      classModel,
      settingsService,
    );
    service = new MyLessonsArchiveService(
      lessonModel,
      classModel,
      lessonMaterialsService,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await lessonModel.deleteMany({});
    await classModel.deleteMany({});
    await materialModel.deleteMany({});
  });

  async function createClass(overrides: Partial<ClassRecord> = {}): Promise<string> {
    const cls = await classModel.create({
      title: 'Тайцзицюань',
      groupLabel: 'группа А',
      format: 'online',
      ...overrides,
    });
    return cls._id.toString();
  }

  async function createLesson(
    classId: string,
    overrides: Partial<LessonRecord> = {},
  ): Promise<string> {
    const lesson = await lessonModel.create({
      classId,
      startsAt: NOW.minus({ hours: 1 }).toJSDate(),
      durationMin: 60,
      topic: 'Форма 24',
      ...overrides,
    });
    return lesson._id.toString();
  }

  it('прошедшее занятие в архиве, будущее — нет', async () => {
    const classId = await createClass();
    const pastId = await createLesson(classId, {
      startsAt: NOW.minus({ hours: 1 }).toJSDate(),
    });
    await createLesson(classId, { startsAt: NOW.plus({ hours: 1 }).toJSDate() });

    const list = await service.list({}, NOW, false);

    expect(list.map((l) => l.id)).toEqual([pastId]);
  });

  it('сортировка по времени начала, по убыванию', async () => {
    const classId = await createClass();
    const earlierId = await createLesson(classId, {
      startsAt: NOW.minus({ hours: 5 }).toJSDate(),
    });
    const laterId = await createLesson(classId, {
      startsAt: NOW.minus({ hours: 1 }).toJSDate(),
    });

    const list = await service.list({}, NOW, false);

    expect(list.map((l) => l.id)).toEqual([laterId, earlierId]);
  });

  it('отменённое прошедшее занятие видно со статусом cancelled', async () => {
    const classId = await createClass();
    const cancelledId = await createLesson(classId, { status: 'cancelled' });

    const list = await service.list({}, NOW, false);

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(cancelledId);
    expect(list[0]?.status).toBe('cancelled');
  });

  it('лимит по умолчанию — 20, больше не отдаёт', async () => {
    const classId = await createClass();
    for (let i = 0; i < 22; i += 1) {
      await createLesson(classId, { startsAt: NOW.minus({ hours: i + 1 }).toJSDate() });
    }

    const list = await service.list({}, NOW, false);

    expect(list).toHaveLength(20);
  });

  it('явный limit уважается', async () => {
    const classId = await createClass();
    for (let i = 0; i < 5; i += 1) {
      await createLesson(classId, { startsAt: NOW.minus({ hours: i + 1 }).toJSDate() });
    }

    const list = await service.list({ limit: 2 }, NOW, false);

    expect(list).toHaveLength(2);
  });

  it('класс занятия не найден (рассинхрон данных) — дата молча пропущена, не падает', async () => {
    await lessonModel.create({
      classId: new Types.ObjectId(),
      startsAt: NOW.minus({ hours: 1 }).toJSDate(),
      durationMin: 60,
      topic: 'Сирота',
    });

    const list = await service.list({}, NOW, false);

    expect(list).toEqual([]);
  });

  it('название класса и подпись группы приезжают из связанного класса', async () => {
    const classId = await createClass({ title: 'Ушу', groupLabel: 'вечерняя' });
    await createLesson(classId);

    const list = await service.list({}, NOW, false);

    expect(list[0]?.classTitle).toBe('Ушу');
    expect(list[0]?.groupLabel).toBe('вечерняя');
  });

  it('запись с записью занятия — видна с корректным видом (ссылка/telegram)', async () => {
    const classId = await createClass();
    await createLesson(classId, {
      recordings: [
        { title: 'Занятие целиком', url: 'https://cloud.example/rec-1' },
        { title: 'В канале', telegramFileId: 'BAACAgIA-secret' },
      ],
    });

    const list = await service.list({}, NOW, false);

    expect(list[0]?.recordings).toEqual([
      { title: 'Занятие целиком', url: 'https://cloud.example/rec-1' },
      { title: 'В канале', inTelegramOnly: true },
    ]);
  });

  // CLAUDE.md «Время»: переход летнего времени Asia/Jerusalem обязателен для
  // любого кода, который считает «когда». Занятие ровно на границе перехода
  // должно попадать в архив (или нет) по сравнению реальных моментов
  // времени в UTC, не «по местным часам» школы/зрителя.
  it('переход на зимнее время Asia/Jerusalem — занятие на границе фильтруется по реальному времени', async () => {
    // Последнее воскресенье октября 2026 — переход с IDT (UTC+3) на IST
    // (UTC+2) в Asia/Jerusalem.
    const beforeTransition = DateTime.fromObject(
      { year: 2026, month: 10, day: 24, hour: 20, minute: 0 },
      { zone: 'Asia/Jerusalem' },
    );
    const now = DateTime.fromObject(
      { year: 2026, month: 10, day: 25, hour: 5, minute: 0 },
      { zone: 'Asia/Jerusalem' },
    );
    expect(beforeTransition.offset).not.toBe(now.offset);

    const classId = await createClass();
    const pastId = await createLesson(classId, {
      startsAt: beforeTransition.toUTC().toJSDate(),
    });
    const futureId = await createLesson(classId, {
      startsAt: now.plus({ minutes: 1 }).toUTC().toJSDate(),
    });

    const list = await service.list({}, now.toUTC(), false);

    expect(list.map((l) => l.id)).toEqual([pastId]);
    expect(list.map((l) => l.id)).not.toContain(futureId);
  });

  // Слой 3.9 (ADR-0056, «Ученик видит привязку там, где ищет») — материалы
  // своей даты едут вместе с занятием в архиве.
  it('материал своей даты приехал в архив, материал соседней даты в неё не попал', async () => {
    const classId = await createClass();
    const ownLessonId = await createLesson(classId);
    const otherLessonId = await createLesson(classId);
    await materialsService.create(
      {
        title: 'Материал своей даты',
        url: 'https://example.com/own',
        kind: 'document',
        lessonIds: [ownLessonId],
      },
      AUTHOR_ID,
    );
    await materialsService.create(
      {
        title: 'Материал соседней даты',
        url: 'https://example.com/other',
        kind: 'document',
        lessonIds: [otherLessonId],
      },
      AUTHOR_ID,
    );

    const list = await service.list({}, NOW, false);

    const own = list.find((l) => l.id === ownLessonId);
    const other = list.find((l) => l.id === otherLessonId);
    expect(own?.materials.map((m) => m.title)).toEqual(['Материал своей даты']);
    expect(other?.materials.map((m) => m.title)).toEqual(['Материал соседней даты']);
  });
});
