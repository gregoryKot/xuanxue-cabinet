// Против настоящей Mongo (CLAUDE.md «Тесты»): upsert по фиксированному
// `_id` в get(), запись PATCH в update(). Проверка плейсхолдеров —
// settings-templates.spec.ts, данные предпросмотра — settings-preview.spec.ts;
// здесь только то, что делает сам сервис (оркестровка + запись в базу).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { DEFAULT_PREVIEW_MINUTES, DEFAULT_TEMPLATES } from '@xuanxue/shared';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { SettingsRecord, SettingsSchema } from './settings.schema';
import { SettingsService } from './settings.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

describe('SettingsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<SettingsRecord>;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;
  let service: SettingsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<SettingsRecord>(SettingsRecord.name, SettingsSchema);
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    const userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    service = new SettingsService(
      model,
      lessonModel,
      classModel,
      new UsersService(userModel),
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      model.deleteMany({}),
      lessonModel.deleteMany({}),
      classModel.deleteMany({}),
    ]);
  });

  describe('get', () => {
    it('создаёт документ школы с дефолтными шаблонами при первом обращении', async () => {
      const settings = await service.get();

      expect(settings.templates).toEqual({
        lesson_link: DEFAULT_TEMPLATES.lesson_link,
        recording: DEFAULT_TEMPLATES.recording,
      });
      expect(settings.tz).toBe('Asia/Jerusalem');
      expect(settings.previewMinutes).toBe(DEFAULT_PREVIEW_MINUTES);
      expect(settings.updatedAt).toEqual(expect.any(String));
      await expect(model.countDocuments({})).resolves.toBe(1);
    });

    it('документ без поля previewMinutes (старая база) — дефолт, не undefined/NaN', async () => {
      // Легаси-документ: создан до этой настройки, поля просто нет —
      // previewMinutes необязателен в схеме (settings.schema.ts), create()
      // без него не отличить от документа, который никогда его не писал.
      await model.create({
        _id: 'school',
        templates: { lessonLink: DEFAULT_TEMPLATES.lesson_link, recording: 'x' },
        tz: 'Asia/Jerusalem',
      });

      const settings = await service.get();

      expect(settings.previewMinutes).toBe(DEFAULT_PREVIEW_MINUTES);
    });

    it('второй вызов не создаёт второй документ и отдаёт тот же результат', async () => {
      const first = await service.get();
      const second = await service.get();

      expect(second).toEqual(first);
      await expect(model.countDocuments({})).resolves.toBe(1);
    });

    it('документ уже есть — второй вызов читает findById, не делает upsert-запись', async () => {
      await service.get();
      const upsertSpy = jest.spyOn(model, 'findOneAndUpdate');

      await service.get();

      expect(upsertSpy).not.toHaveBeenCalled();
      upsertSpy.mockRestore();
    });

    it('гонка двух первых обращений сходится на одном документе', async () => {
      const [a, b] = await Promise.all([service.get(), service.get()]);

      // Один документ на двоих (не два) — по содержимому: updatedAt у
      // проигравшего апдейт может отличаться на пару мс (timestamps:true
      // трогает его на любом findOneAndUpdate, даже без реального изменения
      // полей) — это не порча данных, отдельно не проверяем.
      expect(a.templates).toEqual(b.templates);
      expect(a.tz).toBe(b.tz);
      await expect(model.countDocuments({})).resolves.toBe(1);
    });
  });

  describe('update', () => {
    it('валидный шаблон — сохраняется, get видит его после (read-after-write)', async () => {
      await service.update({ templates: { recording: 'Запись: {название}' } });

      const settings = await service.get();
      expect(settings.templates.recording).toBe('Запись: {название}');
      expect(settings.templates.lesson_link).toBe(DEFAULT_TEMPLATES.lesson_link);
    });

    it('неизвестная подстановка — InvalidInputError, ничего не сохраняется', async () => {
      await expect(
        service.update({ templates: { recording: 'Вела {фамилия}' } }),
      ).rejects.toThrow('неизвестные подстановки');

      const settings = await service.get();
      expect(settings.templates.recording).toBe(DEFAULT_TEMPLATES.recording);
    });

    it('schoolSiteUrl — сохраняется, get видит его после (read-after-write)', async () => {
      await service.update({ schoolSiteUrl: 'https://xuanxue.su' });

      const settings = await service.get();
      expect(settings.schoolSiteUrl).toBe('https://xuanxue.su');
    });

    it('previewMinutes — сохраняется, get видит его после (read-after-write)', async () => {
      await service.update({ previewMinutes: 10 });

      const settings = await service.get();
      expect(settings.previewMinutes).toBe(10);
    });

    it('schoolSiteUrl: null — снимает адрес (поля нет), не сохраняет литерал null', async () => {
      await service.update({ schoolSiteUrl: 'https://xuanxue.su' });

      await service.update({ schoolSiteUrl: null });

      const settings = await service.get();
      expect(settings.schoolSiteUrl).toBeUndefined();
    });

    it('без templates в теле — не трогает базу, отдаёт текущее', async () => {
      const before = await service.get();

      const result = await service.update({});

      expect(result).toEqual(before);
    });

    it('templates: {} — не трогает базу, updatedAt не двигается', async () => {
      const before = await service.get();

      const result = await service.update({ templates: {} });

      expect(result).toEqual(before);
    });

    it('templates с обоими значениями undefined — не трогает базу (class-transformer материализует поля DTO даже для пустого тела)', async () => {
      const before = await service.get();

      const result = await service.update({
        templates: { lesson_link: undefined, recording: undefined },
      });

      expect(result).toEqual(before);
    });

    it('документ пропал между get() и записью — NotFoundError, не тихий undefined', async () => {
      const fakeModel = {
        findById: () => ({
          lean: () =>
            Promise.resolve({
              templates: { lessonLink: 'x', recording: 'y' },
              tz: 'Asia/Jerusalem',
              updatedAt: new Date('2026-09-06T18:00:00Z'),
            }),
        }),
        findOneAndUpdate: () => ({ lean: () => Promise.resolve(null) }),
      } as unknown as Model<SettingsRecord>;
      const raceService = new SettingsService(
        fakeModel,
        {} as unknown as Model<LessonRecord>,
        {} as unknown as Model<ClassRecord>,
        {} as unknown as UsersService,
      );

      await expect(
        raceService.update({ templates: { recording: 'новый текст' } }),
      ).rejects.toThrow('Настройки школы не найдены');
    });
  });

  describe('preview', () => {
    it('рендерит по сохранённому в базе шаблону', async () => {
      const cls = await classModel.create({
        title: 'Цигун для глаз',
        groupLabel: '',
        format: 'online',
        zoomLink: 'https://zoom.example/1',
        tz: 'Asia/Jerusalem',
        leadMinutes: 30,
        active: true,
        channelIds: [],
      });
      const lesson = await lessonModel.create({
        classId: cls._id,
        startsAt: NOW.plus({ minutes: 20 }).toJSDate(),
        durationMin: 60,
        topic: 'Пятое занятие',
        status: 'scheduled',
      });

      const result = await service.preview(
        { kind: 'lesson_link', lessonId: lesson._id.toString() },
        NOW,
      );

      expect(result.text).toContain('Цигун для глаз');
    });

    it('занятие не найдено — NotFoundError', async () => {
      await expect(
        service.preview(
          { kind: 'lesson_link', lessonId: '507f1f77bcf86cd799439011' },
          NOW,
        ),
      ).rejects.toThrow('не найдена');
    });
  });
});

// Настоящая гонка двух upsert по одному `_id` не гарантированно бросает
// E11000 в один прогон (зависит от таймингов MongoMemoryServer) — ветку
// «проигравший читает уже созданный документ» проверяем отдельно фейком
// модели, не дожидаясь недетерминированного совпадения (CLAUDE.md
// «Детерминизм»).
describe('SettingsService.get — гонка E11000 (фейк модели)', () => {
  it('первого чтения нет, upsert бросил дубль — читает уже созданный документ', async () => {
    const doc = {
      templates: { lessonLink: 'шаблон', recording: 'запись' },
      tz: 'Asia/Jerusalem',
      updatedAt: new Date('2026-09-06T18:00:00Z'),
    };
    // Первый findById (до upsert) — документа ещё нет (конкурент не успел);
    // второй (в catch после E11000) — уже есть, конкурент его создал.
    let findByIdCalls = 0;
    const fakeModel = {
      findOneAndUpdate: () => ({
        lean: () => Promise.reject(Object.assign(new Error('E11000'), { code: 11000 })),
      }),
      findById: () => ({
        lean: () => Promise.resolve(findByIdCalls++ === 0 ? null : doc),
      }),
    } as unknown as Model<SettingsRecord>;
    const raceService = new SettingsService(
      fakeModel,
      {} as unknown as Model<LessonRecord>,
      {} as unknown as Model<ClassRecord>,
      {} as unknown as UsersService,
    );

    await expect(raceService.get()).resolves.toEqual({
      templates: { lesson_link: 'шаблон', recording: 'запись' },
      tz: 'Asia/Jerusalem',
      previewMinutes: DEFAULT_PREVIEW_MINUTES, // фейковый doc без поля — дефолт
      updatedAt: '2026-09-06T18:00:00.000Z',
    });
    expect(findByIdCalls).toBe(2);
  });

  it('E11000, но документа так и нет — NotFoundError, не тихий undefined', async () => {
    const fakeModel = {
      findOneAndUpdate: () => ({
        lean: () => Promise.reject(Object.assign(new Error('E11000'), { code: 11000 })),
      }),
      findById: () => ({ lean: () => Promise.resolve(null) }),
    } as unknown as Model<SettingsRecord>;
    const raceService = new SettingsService(
      fakeModel,
      {} as unknown as Model<LessonRecord>,
      {} as unknown as Model<ClassRecord>,
      {} as unknown as UsersService,
    );

    await expect(raceService.get()).rejects.toThrow('Настройки школы не найдены');
  });

  it('findOneAndUpdate падает не с E11000 — ошибка пробрасывается как есть', async () => {
    const fakeModel = {
      findOneAndUpdate: () => ({
        lean: () => Promise.reject(new Error('Mongo недоступна')),
      }),
      findById: () => ({ lean: () => Promise.resolve(null) }),
    } as unknown as Model<SettingsRecord>;
    const raceService = new SettingsService(
      fakeModel,
      {} as unknown as Model<LessonRecord>,
      {} as unknown as Model<ClassRecord>,
      {} as unknown as UsersService,
    );

    await expect(raceService.get()).rejects.toThrow('Mongo недоступна');
  });
});
