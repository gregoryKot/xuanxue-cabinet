// Миграция трогает персональные данные (комментарии учителя лежали в
// criteria) — проверяем на настоящей Mongo (образец: 0007-…spec.ts). Пишем
// документы напрямую нативным драйвером (db().collection(...)), не через
// Mongoose .create(): схема больше не знает про rubric/criteria (contract
// после этого PR), а миграция должна снять поля у данных, которые реально
// лежат в проде до деплоя.
import type { Connection } from 'mongoose';
import { ObjectId } from 'mongodb';
import { gradingWithoutRubric } from './0008-grading-without-rubric.migration';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const EXAMS = 'exams';
const EXAM_GRADINGS = 'exam_gradings';

describe('Миграция 0008-grading-without-rubric', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function insertDoc(
    collectionName: string,
    fields: Record<string, unknown>,
  ): Promise<string> {
    const id = new ObjectId();
    await db()
      .collection(collectionName)
      .insertOne({ _id: id, ...fields });
    return id.toString();
  }

  async function hasField(
    collectionName: string,
    id: string,
    field: string,
  ): Promise<boolean> {
    const doc = await db()
      .collection(collectionName)
      .findOne({ _id: new ObjectId(id) });
    return doc ? field in doc : false;
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await db().collection(EXAMS).deleteMany({});
    await db().collection(EXAM_GRADINGS).deleteMany({});
  });

  it('снимает rubric у формы экзамена', async () => {
    const id = await insertDoc(EXAMS, { title: 'Экзамен', rubric: '[]' });

    await gradingWithoutRubric.up(db());

    expect(await hasField(EXAMS, id, 'rubric')).toBe(false);
  });

  it('снимает criteria у оценки попытки', async () => {
    const id = await insertDoc(EXAM_GRADINGS, { outcome: 'passed', criteria: '[]' });

    await gradingWithoutRubric.up(db());

    expect(await hasField(EXAM_GRADINGS, id, 'criteria')).toBe(false);
  });

  it('документ без rubric/criteria не трогает, остальные поля целы', async () => {
    const examId = await insertDoc(EXAMS, { title: 'Экзамен без рубрики' });
    const gradingId = await insertDoc(EXAM_GRADINGS, { outcome: 'failed' });

    await gradingWithoutRubric.up(db());

    const exam = await db()
      .collection(EXAMS)
      .findOne({ _id: new ObjectId(examId) });
    const grading = await db()
      .collection(EXAM_GRADINGS)
      .findOne({ _id: new ObjectId(gradingId) });
    expect(exam?.title).toBe('Экзамен без рубрики');
    expect(grading?.outcome).toBe('failed');
  });

  it('повторный запуск не падает, поле по-прежнему снято', async () => {
    const id = await insertDoc(EXAMS, { title: 'Экзамен', rubric: '[]' });

    await gradingWithoutRubric.up(db());
    await expect(gradingWithoutRubric.up(db())).resolves.toBeUndefined();

    expect(await hasField(EXAMS, id, 'rubric')).toBe(false);
  });

  it('коллекции пусты — миграция молчит, приложение стартует', async () => {
    await expect(gradingWithoutRubric.up(db())).resolves.toBeUndefined();
  });
});
