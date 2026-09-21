// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): фильтры, шифрование title/url, read-after-write на
// create/update, 404 у чужого/несуществующего id, библиотека ученика без
// createdBy/access, рубильник ADR-0048 (слой 3.4). ENCRYPTION_KEY — из
// test/jest.setup.ts (общий для всех спеков, читается один раз при импорте
// utils/encryption.ts). SettingsService — настоящий, на том же соединении:
// рубильник читается из БД, не из фейка, тем же приёмом, что
// settings.service.spec.ts.
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import { SCHOOL_TZ } from '@xuanxue/shared';
import { CLASS_ENCRYPT_SCHEMA, ClassRecord, ClassSchema } from '../classes/class.schema';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { SettingsRecord, SettingsSchema } from '../settings/settings.schema';
import { SettingsService } from '../settings/settings.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { encryptRecord } from '../utils/encryption';
import { MaterialRecord, MaterialSchema } from './material.schema';
import { MaterialsService } from './materials.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { fakeStorageOrphans } from '../test-support/fake-storage-orphans';

const AUTHOR_ID = new Types.ObjectId().toString();
const NOW = DateTime.fromISO('2026-09-20T10:00:00Z', { zone: 'utc' });

describe('MaterialsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<MaterialRecord>;
  let classModel: Model<ClassRecord>;
  let settingsModel: Model<SettingsRecord>;
  let settingsService: SettingsService;
  let service: MaterialsService;
  let removeNow: jest.Mock;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<MaterialRecord>(MaterialRecord.name, MaterialSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    settingsModel = connection.model<SettingsRecord>(SettingsRecord.name, SettingsSchema);
    const lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    const userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    settingsService = new SettingsService(
      settingsModel,
      lessonModel,
      classModel,
      new UsersService(userModel),
    );
    const orphans = fakeStorageOrphans();
    removeNow = orphans.removeNow;
    service = new MaterialsService(model, classModel, settingsService, orphans.service);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    // Фейк журнала сирот живёт на весь describe — счётчики вызовов чистим,
    // иначе соседний тест видит чужой removeNow.
    jest.clearAllMocks();
    await model.deleteMany({});
    await classModel.deleteMany({});
    await settingsModel.deleteMany({});
  });

  it('create → list: материал сразу виден (read-after-write)', async () => {
    const created = await service.create(
      {
        title: 'Ван Пэйшэн, «Ба-гуа-чжан»',
        url: 'https://example.com/book',
        kind: 'book',
      },
      AUTHOR_ID,
    );

    const list = await service.list({});

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(created.id);
    expect(list[0]?.title).toBe('Ван Пэйшэн, «Ба-гуа-чжан»');
    expect(list[0]?.url).toBe('https://example.com/book');
    expect(list[0]?.kind).toBe('book');
    expect(list[0]?.access).toBe('all');
    expect(list[0]?.createdBy).toBe(AUTHOR_ID);
  });

  it('list: фильтр по classId — материал другого занятия не попадает', async () => {
    const classA = new Types.ObjectId().toString();
    const classB = new Types.ObjectId().toString();
    const created = await service.create(
      {
        title: 'Материал класса А',
        url: 'https://example.com/a',
        kind: 'document',
        classIds: [classA],
      },
      AUTHOR_ID,
    );
    await service.create(
      {
        title: 'Материал класса Б',
        url: 'https://example.com/b',
        kind: 'document',
        classIds: [classB],
      },
      AUTHOR_ID,
    );

    const list = await service.list({ classId: classA });

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(created.id);
  });

  it('list: кривой classId — пустой список, не ошибка', async () => {
    await service.create(
      { title: 'Материал школы', url: 'https://example.com/x', kind: 'video' },
      AUTHOR_ID,
    );

    const list = await service.list({ classId: 'не-id' });

    expect(list).toEqual([]);
  });

  // ADR-0056: привязка к дате занятия рядом с привязкой к курсу.
  it('create → list: lessonIds сохраняются и приходят обратно (read-after-write)', async () => {
    const lessonId = new Types.ObjectId().toString();

    const created = await service.create(
      {
        title: 'Ссылка со вторника',
        url: 'https://example.com/link',
        kind: 'article',
        lessonIds: [lessonId],
      },
      AUTHOR_ID,
    );

    expect(created.lessonIds).toEqual([lessonId]);
    const list = await service.list({});
    expect(list[0]?.lessonIds).toEqual([lessonId]);
  });

  it('list: фильтр по lessonId — материал другой даты не попадает', async () => {
    const lessonA = new Types.ObjectId().toString();
    const lessonB = new Types.ObjectId().toString();
    const created = await service.create(
      {
        title: 'Материал даты А',
        url: 'https://example.com/a',
        kind: 'document',
        lessonIds: [lessonA],
      },
      AUTHOR_ID,
    );
    await service.create(
      {
        title: 'Материал даты Б',
        url: 'https://example.com/b',
        kind: 'document',
        lessonIds: [lessonB],
      },
      AUTHOR_ID,
    );

    const list = await service.list({ lessonId: lessonA });

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(created.id);
  });

  it('list: фильтр по lessonId и classId одновременно — материал должен подойти под оба', async () => {
    const classId = new Types.ObjectId().toString();
    const lessonId = new Types.ObjectId().toString();
    const both = await service.create(
      {
        title: 'И курс, и дата',
        url: 'https://example.com/both',
        kind: 'document',
        classIds: [classId],
        lessonIds: [lessonId],
      },
      AUTHOR_ID,
    );
    await service.create(
      {
        title: 'Только курс',
        url: 'https://example.com/class-only',
        kind: 'document',
        classIds: [classId],
      },
      AUTHOR_ID,
    );
    await service.create(
      {
        title: 'Только дата',
        url: 'https://example.com/lesson-only',
        kind: 'document',
        lessonIds: [lessonId],
      },
      AUTHOR_ID,
    );

    const list = await service.list({ classId, lessonId });

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(both.id);
  });

  it('list: кривой lessonId — пустой список, не ошибка', async () => {
    await service.create(
      { title: 'Материал школы', url: 'https://example.com/x', kind: 'video' },
      AUTHOR_ID,
    );

    const list = await service.list({ lessonId: 'не-id' });

    expect(list).toEqual([]);
  });

  it('update: меняет lessonIds и не трогает classIds', async () => {
    const classId = new Types.ObjectId().toString();
    const lessonId = new Types.ObjectId().toString();
    const created = await service.create(
      {
        title: 'Материал',
        url: 'https://example.com/upd',
        kind: 'document',
        classIds: [classId],
      },
      AUTHOR_ID,
    );

    const updated = await service.update(created.id, { lessonIds: [lessonId] });

    expect(updated.lessonIds).toEqual([lessonId]);
    expect(updated.classIds).toEqual([classId]);
  });

  it('list: фильтр по kind', async () => {
    await service.create(
      { title: 'Видео разбора формы', url: 'https://example.com/v', kind: 'video' },
      AUTHOR_ID,
    );
    await service.create(
      { title: 'Методичка форм', url: 'https://example.com/d', kind: 'document' },
      AUTHOR_ID,
    );

    const list = await service.list({ kind: 'video' });

    expect(list).toHaveLength(1);
    expect(list[0]?.kind).toBe('video');
  });

  it('list: лимит по умолчанию и явный', async () => {
    for (let i = 0; i < 3; i += 1) {
      await service.create(
        { title: `Материал ${i}`, url: `https://example.com/${i}`, kind: 'article' },
        AUTHOR_ID,
      );
    }

    expect(await service.list({})).toHaveLength(3);
    expect(await service.list({ limit: 2 })).toHaveLength(2);
  });

  it('update: меняет присланные поля и не трогает остальные', async () => {
    const created = await service.create(
      { title: 'Черновик', url: 'https://example.com/draft', kind: 'article' },
      AUTHOR_ID,
    );

    const updated = await service.update(created.id, { title: 'Готовая статья' });

    expect(updated.title).toBe('Готовая статья');
    expect(updated.url).toBe('https://example.com/draft');
    expect(updated.kind).toBe('article');
  });

  it('update несуществующего id — NotFoundError', async () => {
    await expect(
      service.update(new Types.ObjectId().toString(), { title: 'x' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('update кривого id — NotFoundError, не CastError', async () => {
    await expect(service.update('не-id', { title: 'x' })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('remove: материал пропадает из списка, второй remove — NotFoundError', async () => {
    const created = await service.create(
      { title: 'Материал на удаление', url: 'https://example.com/rm', kind: 'article' },
      AUTHOR_ID,
    );

    await service.remove(created.id, NOW);

    expect(await service.list({})).toHaveLength(0);
    await expect(service.remove(created.id, NOW)).rejects.toMatchObject({ status: 404 });
  });

  // ADR-0057: файл уходит тем же действием, что и материал. Проверяем
  // read-after-write — что удалился именно записанный ключ, а не «какой-то».
  it('remove: у материала с файлом ключ объекта уходит в уборку', async () => {
    const created = await service.create(
      { title: 'Методичка', url: 'https://example.com/m', kind: 'document' },
      AUTHOR_ID,
    );
    const key = `materials/${created.id}/3f1a4c9e`;
    await model.updateOne({ _id: created.id }, { $set: { fileKey: key } });

    await service.remove(created.id, NOW);

    expect(removeNow).toHaveBeenCalledWith(key, NOW);
  });

  it('remove: у материала без файла уборку не зовём вовсе', async () => {
    const created = await service.create(
      { title: 'Просто ссылка', url: 'https://example.com/l', kind: 'article' },
      AUTHOR_ID,
    );

    await service.remove(created.id, NOW);

    expect(removeNow).not.toHaveBeenCalled();
  });

  it('title и url зашифрованы в сырой Mongo — расшифровка идёт только через сервис', async () => {
    const created = await service.create(
      { title: 'Секретное название', url: 'https://example.com/secret', kind: 'book' },
      AUTHOR_ID,
    );

    const raw = await model.collection.findOne<{ title?: string; url?: string }>({
      _id: new Types.ObjectId(created.id),
    });

    expect(raw?.title).toBeDefined();
    expect(raw?.title).not.toBe('Секретное название');
    expect(raw?.url).toBeDefined();
    expect(raw?.url).not.toBe('https://example.com/secret');
  });

  it('listForStudent: не отдаёт createdBy и access', async () => {
    await service.create(
      { title: 'Материал ученику', url: 'https://example.com/student', kind: 'book' },
      AUTHOR_ID,
    );

    const list = await service.listForStudent({}, false);

    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('createdBy');
    expect(list[0]).not.toHaveProperty('access');
    expect(list[0]?.url).toBe('https://example.com/student');
    expect(list[0]?.classTitles).toEqual([]);
  });

  // Ученику занятия приезжают названиями: `GET /classes` ему закрыт ролью,
  // подписать id было бы нечем (ADR-0047).
  it('listForStudent: привязанное занятие приходит названием, а не id', async () => {
    const cls = await classModel.create(
      encryptRecord(
        {
          title: 'Тайцзицюань, средняя группа',
          groupLabel: 'Средняя',
          format: 'online',
          tz: SCHOOL_TZ,
          rules: [],
          channelIds: [],
          active: true,
        },
        CLASS_ENCRYPT_SCHEMA,
      ),
    );
    await service.create(
      {
        title: 'Разбор формы',
        url: 'https://example.com/form',
        kind: 'video',
        classIds: [cls._id.toString()],
      },
      AUTHOR_ID,
    );

    const list = await service.listForStudent({}, false);

    expect(list[0]?.classTitles).toEqual(['Тайцзицюань, средняя группа']);
  });

  // Отметка «после оплаты» сохраняется с первого дня, хотя рубильник школы
  // появится слоем 3.4 (ADR-0048): иначе Диме пришлось бы проставлять её
  // заново по всей библиотеке в день включения.
  it('create: access и classIds сохраняются, когда их прислали', async () => {
    const classId = new Types.ObjectId().toString();

    const created = await service.create(
      {
        title: 'Разбор толкающих рук',
        url: 'https://example.com/video',
        kind: 'video',
        classIds: [classId],
        access: 'paid',
      },
      AUTHOR_ID,
    );

    expect(created.access).toBe('paid');
    expect(created.classIds).toEqual([classId]);
  });

  // ADR-0058: нормализация при записи — тег становится фильтром, опечатка
  // не должна плодить второе значение.
  describe('теги (ADR-0058)', () => {
    it('create: нормализует теги (обрезка, дедуп без учёта регистра)', async () => {
      const created = await service.create(
        {
          title: 'Разбор формы',
          url: 'https://example.com/form',
          kind: 'video',
          tags: ['  Старшая ', 'старшая', 'разминка  группа'],
        },
        AUTHOR_ID,
      );

      expect(created.tags).toEqual(['Старшая', 'разминка группа']);
    });

    it('create без tags — пустой массив, не undefined', async () => {
      const created = await service.create(
        { title: 'Без тегов', url: 'https://example.com/x', kind: 'article' },
        AUTHOR_ID,
      );

      expect(created.tags).toEqual([]);
    });

    it('update: нормализует присланные теги', async () => {
      const created = await service.create(
        { title: 'Материал', url: 'https://example.com/y', kind: 'book', tags: ['раз'] },
        AUTHOR_ID,
      );

      const updated = await service.update(created.id, {
        tags: ['Два', 'два', '  Три  '],
      });

      expect(updated.tags).toEqual(['Два', 'Три']);
    });

    it('update без tags — прежние теги не трогает', async () => {
      const created = await service.create(
        {
          title: 'Материал',
          url: 'https://example.com/z',
          kind: 'book',
          tags: ['старшая'],
        },
        AUTHOR_ID,
      );

      const updated = await service.update(created.id, { title: 'Новое название' });

      expect(updated.tags).toEqual(['старшая']);
    });

    it('create → list: read-after-write — фильтр по тегу находит материал', async () => {
      const created = await service.create(
        {
          title: 'Разбор толкающих рук',
          url: 'https://example.com/tui-shou',
          kind: 'video',
          tags: ['старшая', 'толкающие руки'],
        },
        AUTHOR_ID,
      );
      await service.create(
        { title: 'Другой материал', url: 'https://example.com/o', kind: 'article' },
        AUTHOR_ID,
      );

      const list = await service.list({ tag: 'старшая' });

      expect(list).toHaveLength(1);
      expect(list[0]?.id).toBe(created.id);
    });

    it('list: фильтр по несуществующему тегу — пустой список, не ошибка', async () => {
      await service.create(
        {
          title: 'Материал',
          url: 'https://example.com/a',
          kind: 'article',
          tags: ['раз'],
        },
        AUTHOR_ID,
      );

      const list = await service.list({ tag: 'нет-такого' });

      expect(list).toEqual([]);
    });

    it('list: пустая строка в query.tag — как отсутствие фильтра', async () => {
      await service.create(
        {
          title: 'Материал',
          url: 'https://example.com/b',
          kind: 'article',
          tags: ['раз'],
        },
        AUTHOR_ID,
      );

      const list = await service.list({ tag: '' });

      expect(list).toHaveLength(1);
    });

    it('документ без поля tags (до этого PR) — listForStudent отдаёт []', async () => {
      const created = await service.create(
        { title: 'Старый материал', url: 'https://example.com/old', kind: 'book' },
        AUTHOR_ID,
      );
      // Имитируем документ, заведённый до ADR-0058: поля в базе нет вовсе.
      await model.collection.updateOne(
        { _id: new Types.ObjectId(created.id) },
        { $unset: { tags: '' } },
      );

      const list = await service.listForStudent({}, false);

      expect(list[0]?.tags).toEqual([]);
    });

    it('listForStudent: отдаёт теги ученику', async () => {
      await service.create(
        {
          title: 'Разминка',
          url: 'https://example.com/warmup',
          kind: 'video',
          tags: ['разминка'],
        },
        AUTHOR_ID,
      );

      const list = await service.listForStudent({}, false);

      expect(list[0]?.tags).toEqual(['разминка']);
    });
  });

  it('listForStudent: явный лимит обрезает список', async () => {
    for (const title of ['Первый', 'Второй', 'Третий']) {
      await service.create(
        { title, url: 'https://example.com/a', kind: 'article' },
        AUTHOR_ID,
      );
    }

    await expect(service.listForStudent({ limit: 2 }, false)).resolves.toHaveLength(2);
  });

  // ADR-0058: `staff`-материал ученику не приходит вовсе — фильтр запроса, не
  // отбрасывание после выборки.
  describe('listForStudent: access=staff (ADR-0058)', () => {
    it('ученик не видит staff-материал, штат видит', async () => {
      await service.create(
        {
          title: 'Методичка для преподавателей',
          url: 'https://example.com/staff',
          kind: 'document',
          access: 'staff',
        },
        AUTHOR_ID,
      );
      await service.create(
        { title: 'Вводное видео', url: 'https://example.com/free', kind: 'video' },
        AUTHOR_ID,
      );

      const studentList = await service.listForStudent({}, false);
      const staffList = await service.listForStudent({}, true);

      expect(studentList.map((m) => m.title)).toEqual(['Вводное видео']);
      expect(staffList.map((m) => m.title).sort()).toEqual(
        ['Вводное видео', 'Методичка для преподавателей'].sort(),
      );
    });

    // Фильтр — в самом запросе к Mongo, не после лимита: иначе staff-материалы
    // съедали бы места в странице ученика (ADR-0058).
    it('staff-материалы не съедают лимит списка ученика', async () => {
      for (let i = 0; i < 3; i += 1) {
        await service.create(
          {
            title: `Служебный ${i}`,
            url: `https://example.com/s${i}`,
            kind: 'document',
            access: 'staff',
          },
          AUTHOR_ID,
        );
      }
      for (let i = 0; i < 2; i += 1) {
        await service.create(
          { title: `Открытый ${i}`, url: `https://example.com/o${i}`, kind: 'article' },
          AUTHOR_ID,
        );
      }

      const list = await service.listForStudent({ limit: 2 }, false);

      expect(list).toHaveLength(2);
      expect(list.every((m) => m.title.startsWith('Открытый'))).toBe(true);
    });

    it('paid-материал ученику приходит как обычно, а не под флагом staff', async () => {
      await service.create(
        {
          title: 'Платный разбор',
          url: 'https://example.com/paid2',
          kind: 'video',
          access: 'paid',
        },
        AUTHOR_ID,
      );

      const beforeToggle = await service.listForStudent({}, false);
      expect(beforeToggle[0]?.url).toBe('https://example.com/paid2');

      await settingsService.update({ materialsPaidAccess: true });
      const afterToggle = await service.listForStudent({}, false);
      expect(afterToggle[0]?.locked).toBe(true);
    });
  });

  // Слой 3.4 (ADR-0048) — оба положения рубильника плюс штат, гейт из самого ADR.
  describe('listForStudent: рубильник materialsPaidAccess', () => {
    it('рубильник выключен (по умолчанию) — ученик получает url paid-материала', async () => {
      await service.create(
        {
          title: 'Разбор толкающих рук',
          url: 'https://example.com/paid',
          kind: 'video',
          access: 'paid',
        },
        AUTHOR_ID,
      );

      const list = await service.listForStudent({}, false);

      expect(list[0]?.url).toBe('https://example.com/paid');
      expect(list[0]).not.toHaveProperty('locked');
    });

    it('рубильник включён — у paid-материала нет url, locked:true; all-материал как был', async () => {
      await service.create(
        {
          title: 'Разбор толкающих рук',
          url: 'https://example.com/paid',
          kind: 'video',
          access: 'paid',
        },
        AUTHOR_ID,
      );
      await service.create(
        {
          title: 'Вводное видео',
          url: 'https://example.com/free',
          kind: 'video',
          access: 'all',
        },
        AUTHOR_ID,
      );
      await settingsService.update({ materialsPaidAccess: true });

      const list = await service.listForStudent({}, false);

      const paid = list.find((m) => m.title === 'Разбор толкающих рук');
      const free = list.find((m) => m.title === 'Вводное видео');
      expect(paid?.locked).toBe(true);
      expect(paid).not.toHaveProperty('url');
      expect(free?.url).toBe('https://example.com/free');
      expect(free).not.toHaveProperty('locked');
    });

    it('рубильник включён — штат получает url paid-материала, не locked', async () => {
      await service.create(
        {
          title: 'Разбор толкающих рук',
          url: 'https://example.com/paid',
          kind: 'video',
          access: 'paid',
        },
        AUTHOR_ID,
      );
      await settingsService.update({ materialsPaidAccess: true });

      const list = await service.listForStudent({}, true);

      expect(list[0]?.url).toBe('https://example.com/paid');
      expect(list[0]).not.toHaveProperty('locked');
    });
  });
});
