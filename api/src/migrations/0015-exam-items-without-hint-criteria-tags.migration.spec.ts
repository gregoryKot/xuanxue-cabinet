// Миграция трогает данные школы (вопросы банка) — проверяем на настоящей
// Mongo (образец: 0010-drop-user-tz.migration.spec.ts). Пишем документы
// напрямую нативным драйвером, не через Mongoose .create(): миграция обязана
// отработать на данных, которые реально лежат в проде до деплоя, а схема
// после contract-шага полей hint/criteria/tags уже не знает и записать их
// не даст.
import { mongo, type Connection } from 'mongoose';
import { examItemsWithoutHintCriteriaTags } from './0015-exam-items-without-hint-criteria-tags.migration';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const { ObjectId } = mongo;
const EXAM_ITEMS = 'exam_items';

describe('Миграция 0015-exam-items-without-hint-criteria-tags', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function createItem(fields: Record<string, unknown>): Promise<string> {
    const id = new ObjectId();
    await db()
      .collection(EXAM_ITEMS)
      .insertOne({
        _id: id,
        kind: 'text',
        prompt: 'зашифрованная формулировка',
        options: '[]',
        status: 'published',
        version: 1,
        history: '[]',
        ...fields,
      });
    return id.toString();
  }

  async function rawItem(id: string): Promise<Record<string, unknown>> {
    const doc = await db()
      .collection(EXAM_ITEMS)
      .findOne({ _id: new ObjectId(id) });
    if (!doc) throw new Error(`вопрос ${id} не найден`);
    return doc;
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await db().collection(EXAM_ITEMS).deleteMany({});
  });

  it('hint/criteria/tags снимаются у вопроса, где есть все три поля', async () => {
    const id = await createItem({
      hint: 'зашифрованная подсказка',
      criteria: 'зашифрованные критерии',
      tags: ['ян', 'база'],
    });

    await examItemsWithoutHintCriteriaTags.up(db());

    const doc = await rawItem(id);
    expect('hint' in doc).toBe(false);
    expect('criteria' in doc).toBe(false);
    expect('tags' in doc).toBe(false);
  });

  it('снимается и одно поле из трёх — остальные два у него и не были', async () => {
    const id = await createItem({ tags: ['теория'] });

    await examItemsWithoutHintCriteriaTags.up(db());

    expect('tags' in (await rawItem(id))).toBe(false);
  });

  it('остальные поля вопроса остаются нетронутыми', async () => {
    const id = await createItem({
      hint: 'подсказка',
      prompt: 'формулировка',
      status: 'draft',
      version: 3,
    });

    await examItemsWithoutHintCriteriaTags.up(db());

    const doc = await rawItem(id);
    expect(doc.prompt).toBe('формулировка');
    expect(doc.status).toBe('draft');
    expect(doc.version).toBe(3);
  });

  it('history (зашифрованный JSON) не трогается — там hint/criteria исторический факт', async () => {
    const id = await createItem({ hint: 'подсказка', history: 'зашифрованная-история' });

    await examItemsWithoutHintCriteriaTags.up(db());

    expect((await rawItem(id)).history).toBe('зашифрованная-история');
  });

  it('документ без hint/criteria/tags не ломается', async () => {
    const id = await createItem({});

    await expect(examItemsWithoutHintCriteriaTags.up(db())).resolves.toBeUndefined();

    const doc = await rawItem(id);
    expect('hint' in doc).toBe(false);
    expect('criteria' in doc).toBe(false);
    expect('tags' in doc).toBe(false);
  });

  it('повторный запуск ничего не меняет (идемпотентность)', async () => {
    const id = await createItem({ hint: 'h', criteria: 'c', tags: ['t'] });

    await examItemsWithoutHintCriteriaTags.up(db());
    await examItemsWithoutHintCriteriaTags.up(db());

    const doc = await rawItem(id);
    expect('hint' in doc).toBe(false);
    expect('criteria' in doc).toBe(false);
    expect('tags' in doc).toBe(false);
  });

  it('пустая база молчит', async () => {
    await expect(examItemsWithoutHintCriteriaTags.up(db())).resolves.toBeUndefined();

    expect(await db().collection(EXAM_ITEMS).countDocuments()).toBe(0);
  });
});
