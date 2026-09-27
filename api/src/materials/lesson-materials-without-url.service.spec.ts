// LessonMaterialsService.findByLessonIds — тот же отбор «есть чем открыть»
// (STUDENT_OPENABLE_FILTER, ADR-0133), что у MaterialsService.listForStudent,
// применённый в архиве занятий ученика. Отдельный файл, не
// lesson-materials.service.spec.ts: новый класс поведения новым файлом, тот
// же приём, что у materials-without-url.service.spec.ts рядом. Материалы
// заводим через MaterialsService.create (не голым `model.create`), чтобы
// title/url прошли настоящее шифрование — тот же приём, что и в
// lesson-materials.service.spec.ts.
import { Types, type Connection, type Model } from 'mongoose';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { fakeStorageOrphans } from '../test-support/fake-storage-orphans';
import { LessonMaterialsService } from './lesson-materials.service';
import { MaterialRecord, MaterialSchema } from './material.schema';
import { MaterialsService } from './materials.service';

const AUTHOR_ID = new Types.ObjectId().toString();

describe('LessonMaterialsService: материал без url (ADR-0133)', () => {
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
  });

  it('ученик не видит в архиве материал без url и без файла', async () => {
    const lessonId = new Types.ObjectId().toString();
    await materialsService.create(
      { title: 'Пустой черновик', kind: 'document', lessonIds: [lessonId] },
      AUTHOR_ID,
    );

    const byLessonId = await service.findByLessonIds([lessonId], false);

    expect(byLessonId.get(lessonId)).toBeUndefined();
  });

  it('ученик видит в архиве материал без url, но с файлом', async () => {
    const lessonId = new Types.ObjectId().toString();
    const created = await materialsService.create(
      { title: 'Только файл', kind: 'document', lessonIds: [lessonId] },
      AUTHOR_ID,
    );
    await model.updateOne(
      { _id: created.id },
      {
        $set: {
          fileKey: `materials/${created.id}/uuid`,
          fileName: 'Методичка.pdf',
          fileContentType: 'application/pdf',
          fileUploadedAt: new Date(),
        },
      },
    );

    const byLessonId = await service.findByLessonIds([lessonId], false);

    expect(byLessonId.get(lessonId)?.map((m) => m.title)).toEqual(['Только файл']);
    expect(byLessonId.get(lessonId)?.[0]).not.toHaveProperty('url');
  });

  it('штат видит в архиве материал без url и без файла', async () => {
    const lessonId = new Types.ObjectId().toString();
    await materialsService.create(
      { title: 'Черновик без файла', kind: 'document', lessonIds: [lessonId] },
      AUTHOR_ID,
    );

    const byLessonId = await service.findByLessonIds([lessonId], true);

    expect(byLessonId.get(lessonId)?.map((m) => m.title)).toEqual(['Черновик без файла']);
  });
});
