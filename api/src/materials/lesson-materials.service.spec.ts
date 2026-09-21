// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): join «материалы → даты архива» одним запросом, вырезание
// access:'staff' (ADR-0058) — тот же приём проверки, что у
// materials.service.spec.ts (listForStudent), потому что это ровно то же
// правило доступа, применённое ещё и здесь.
import { Types, type Connection, type Model } from 'mongoose';
import { SCHOOL_TZ } from '@xuanxue/shared';
import { CLASS_ENCRYPT_SCHEMA, ClassRecord, ClassSchema } from '../classes/class.schema';
import { encryptRecord } from '../utils/encryption';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { LessonMaterialsService } from './lesson-materials.service';
import { MaterialRecord, MaterialSchema } from './material.schema';
import { fakeStorageOrphans } from '../test-support/fake-storage-orphans';
import { MaterialsService } from './materials.service';

const AUTHOR_ID = new Types.ObjectId().toString();

describe('LessonMaterialsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<MaterialRecord>;
  let classModel: Model<ClassRecord>;
  let materialsService: MaterialsService;
  let service: LessonMaterialsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<MaterialRecord>(MaterialRecord.name, MaterialSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    materialsService = new MaterialsService(
      model,
      classModel,
      fakeStorageOrphans().service,
    );
    service = new LessonMaterialsService(model, classModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
    await classModel.deleteMany({});
  });

  it('пустой список дат — пустая Map, в базу не ходим', async () => {
    const result = await service.findByLessonIds([], false);

    expect(result.size).toBe(0);
  });

  it('материал попал к своей дате и не попал к соседней', async () => {
    const lessonA = new Types.ObjectId().toString();
    const lessonB = new Types.ObjectId().toString();
    await materialsService.create(
      {
        title: 'Материал даты А',
        url: 'https://example.com/a',
        kind: 'document',
        lessonIds: [lessonA],
      },
      AUTHOR_ID,
    );

    const result = await service.findByLessonIds([lessonA, lessonB], false);

    expect(result.get(lessonA)?.map((m) => m.title)).toEqual(['Материал даты А']);
    expect(result.has(lessonB)).toBe(false);
  });

  it('материал, привязанный к двум датам — виден у обеих', async () => {
    const lessonA = new Types.ObjectId().toString();
    const lessonB = new Types.ObjectId().toString();
    await materialsService.create(
      {
        title: 'Материал двух дат',
        url: 'https://example.com/ab',
        kind: 'document',
        lessonIds: [lessonA, lessonB],
      },
      AUTHOR_ID,
    );

    const result = await service.findByLessonIds([lessonA, lessonB], false);

    expect(result.get(lessonA)?.[0]?.title).toBe('Материал двух дат');
    expect(result.get(lessonB)?.[0]?.title).toBe('Материал двух дат');
  });

  // ADR-0058: staff-материал ученику не приходит вовсе — фильтр запроса, не
  // отбрасывание после выборки. То же правило, что и в библиотеке — иначе
  // его можно обойти открыв не «Материалы», а «Архив занятий» (ADR-0096
  // «Решение»).
  it('access: staff — ученику не приходит вовсе ни в каком поле, штату приходит с url', async () => {
    const lessonId = new Types.ObjectId().toString();
    await materialsService.create(
      {
        title: 'Методичка для преподавателей',
        url: 'https://example.com/staff',
        kind: 'document',
        access: 'staff',
        lessonIds: [lessonId],
      },
      AUTHOR_ID,
    );

    const studentResult = await service.findByLessonIds([lessonId], false);
    const staffResult = await service.findByLessonIds([lessonId], true);

    expect(studentResult.has(lessonId)).toBe(false);
    expect(JSON.stringify([...studentResult.values()])).not.toContain(
      'https://example.com/staff',
    );
    expect(staffResult.get(lessonId)?.[0]?.title).toBe('Методичка для преподавателей');
    expect(staffResult.get(lessonId)?.[0]?.url).toBe('https://example.com/staff');
  });

  // Ученику занятия приезжают названиями: `GET /classes` ему закрыт ролью
  // (ADR-0047), тот же приём, что у materials.service.spec.ts.
  it('названия занятий (classTitles) подставляются', async () => {
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
    const lessonId = new Types.ObjectId().toString();
    await materialsService.create(
      {
        title: 'Разбор формы',
        url: 'https://example.com/form',
        kind: 'video',
        classIds: [cls._id.toString()],
        lessonIds: [lessonId],
      },
      AUTHOR_ID,
    );

    const result = await service.findByLessonIds([lessonId], false);

    expect(result.get(lessonId)?.[0]?.classTitles).toEqual([
      'Тайцзицюань, средняя группа',
    ]);
  });
});
