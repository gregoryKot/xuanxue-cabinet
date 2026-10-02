// Правка чужих данных в проде — самое место для теста на настоящей Mongo
// (ADR-0165): старые видео вопросов получают `ready` и отпечаток-заглушку,
// а то, что уже загружается частями или готово по-новому, не меняется.
import type { Connection } from 'mongoose';
import { ExamVideoRecord } from '../exam-videos/exam-video.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { examVideosReady } from './0021-exam-videos-ready.migration';

describe('Миграция 0021-exam-videos-ready', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  const videos = () => db().collection('exam_videos');

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await videos().deleteMany({});
  });

  it('id начинается с номера 0021 — порядок реестра описывает порядок применения', () => {
    expect(examVideosReady.id).toBe('0021-exam-videos-ready');
  });

  it('видео без status получает ready и отпечаток legacy:<_id>', async () => {
    const legacy = await videos().insertOne({
      key: 'exam-videos/old',
      contentType: 'video/mp4',
      sizeBytes: 10,
    });

    await examVideosReady.up(db());

    const doc = await videos().findOne({ _id: legacy.insertedId });
    expect(doc?.status).toBe('ready');
    expect(doc?.fingerprint).toBe(`legacy:${legacy.insertedId.toString()}`);
  });

  it('загрузка частями и готовое по-новому не меняются', async () => {
    const uploading = await videos().insertOne({
      key: 'exam-videos/u',
      status: 'uploading',
      fingerprint: '10:abc',
    });
    const ready = await videos().insertOne({
      key: 'exam-videos/r',
      status: 'ready',
      fingerprint: '20:def',
    });

    await examVideosReady.up(db());

    expect(await videos().findOne({ _id: uploading.insertedId })).toMatchObject({
      status: 'uploading',
      fingerprint: '10:abc',
    });
    expect(await videos().findOne({ _id: ready.insertedId })).toMatchObject({
      status: 'ready',
      fingerprint: '20:def',
    });
  });

  it('повторный запуск ничего не меняет', async () => {
    const legacy = await videos().insertOne({ key: 'exam-videos/old' });
    await examVideosReady.up(db());
    const afterFirst = await videos().findOne({ _id: legacy.insertedId });

    await examVideosReady.up(db());

    expect(await videos().findOne({ _id: legacy.insertedId })).toEqual(afterFirst);
  });

  it('пустая коллекция — не падает', async () => {
    await expect(examVideosReady.up(db())).resolves.toBeUndefined();
    expect(await videos().countDocuments({})).toBe(0);
  });

  it('после миграции схема принимает пересохранение старой записи', async () => {
    const legacy = await videos().insertOne({
      key: 'exam-videos/old',
      contentType: 'video/mp4',
      sizeBytes: 10,
    });
    await examVideosReady.up(db());

    const model = connection.model<ExamVideoRecord>(ExamVideoRecord.name);
    const doc = await model.findById(legacy.insertedId);
    await expect(doc?.validate()).resolves.toBeUndefined();
  });
});
