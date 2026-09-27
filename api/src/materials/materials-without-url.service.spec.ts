// Материал без ссылки, но с файлом (ADR-0134, уточняет ADR-0057 и ADR-0047) —
// против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»). Отдельный файл, не materials.service.spec.ts: тот файл (623
// строки) храповик размера запрещает пополнять — новый класс поведения едет
// новым файлом. Устройство теста — тот же образец, что в
// materials.service.spec.ts.
import { Types, type Connection, type Model } from 'mongoose';
import { MaterialRecord, MaterialSchema } from './material.schema';
import { MaterialsService } from './materials.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { fakeStorageOrphans } from '../test-support/fake-storage-orphans';
import { ClassRecord, ClassSchema } from '../classes/class.schema';

const AUTHOR_ID = new Types.ObjectId().toString();

describe('MaterialsService: материал без url (ADR-0134)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<MaterialRecord>;
  let classModel: Model<ClassRecord>;
  let service: MaterialsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<MaterialRecord>(MaterialRecord.name, MaterialSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    service = new MaterialsService(model, classModel, fakeStorageOrphans().service);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('create без url — в документе нет ключа url, в DTO его тоже нет', async () => {
    const created = await service.create(
      { title: 'Методичка одним файлом', kind: 'document' },
      AUTHOR_ID,
    );

    expect(created).not.toHaveProperty('url');
    const raw = await model.collection.findOne({ _id: new Types.ObjectId(created.id) });
    expect(raw).not.toHaveProperty('url');
  });

  it('create с url — ключ url есть и в документе, и в DTO (read-after-write)', async () => {
    const created = await service.create(
      { title: 'Со ссылкой', url: 'https://example.com/book', kind: 'book' },
      AUTHOR_ID,
    );

    expect(created.url).toBe('https://example.com/book');
    const raw = await model.collection.findOne<{ url?: string }>({
      _id: new Types.ObjectId(created.id),
    });
    expect(raw?.url).toBeDefined();
  });

  it('PATCH url: null — снимает ссылку (read-after-write, ключа url больше нет)', async () => {
    const created = await service.create(
      { title: 'Со ссылкой', url: 'https://example.com/remove-me', kind: 'article' },
      AUTHOR_ID,
    );

    const updated = await service.update(created.id, { url: null });
    expect(updated).not.toHaveProperty('url');

    // Читаем заново — не полагаемся только на ответ PATCH.
    const list = await service.list({});
    const reloaded = list.find((m) => m.id === created.id);
    expect(reloaded).not.toHaveProperty('url');
    const raw = await model.collection.findOne({ _id: new Types.ObjectId(created.id) });
    expect(raw).not.toHaveProperty('url');
  });

  it('PATCH без url — ссылку не трогает', async () => {
    const created = await service.create(
      { title: 'Черновик', url: 'https://example.com/keep', kind: 'article' },
      AUTHOR_ID,
    );

    const updated = await service.update(created.id, { title: 'Готово' });

    expect(updated.title).toBe('Готово');
    expect(updated.url).toBe('https://example.com/keep');
  });

  // Материал без ссылки и без файла ученику бесполезен — строка без
  // «Открыть» и «Скачать» (STUDENT_OPENABLE_FILTER, materials.queries.ts).
  it('listForStudent: не видит материал без url и без файла', async () => {
    await service.create({ title: 'Пустой черновик', kind: 'document' }, AUTHOR_ID);
    await service.create(
      { title: 'С файлом придёт позже', url: 'https://example.com/ok', kind: 'article' },
      AUTHOR_ID,
    );

    const list = await service.listForStudent({}, false);

    expect(list.map((m) => m.title)).toEqual(['С файлом придёт позже']);
  });

  it('listForStudent: видит материал без url, но с файлом', async () => {
    const created = await service.create(
      { title: 'Только файл', kind: 'document' },
      AUTHOR_ID,
    );
    // Файл вставляем моделью напрямую — загрузка байтов не тема этого теста
    // (она уже покрыта material-files.e2e-spec.ts).
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

    const list = await service.listForStudent({}, false);

    expect(list.map((m) => m.title)).toEqual(['Только файл']);
    expect(list[0]).not.toHaveProperty('url');
    expect(list[0]?.file?.name).toBe('Методичка.pdf');
  });

  // Штат видит всё, включая только что созданный материал, которому файл
  // ещё не долетел — фильтр «есть чем открыть» только для ученика.
  it('listForStudent: штат видит материал без url и без файла', async () => {
    await service.create({ title: 'Черновик без файла', kind: 'document' }, AUTHOR_ID);

    const list = await service.listForStudent({}, true);

    expect(list.map((m) => m.title)).toEqual(['Черновик без файла']);
  });
});
