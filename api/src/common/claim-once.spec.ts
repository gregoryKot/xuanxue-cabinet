// Против настоящей Mongo (CLAUDE.md «Тесты») — общий claimOnce делит
// PreviewService/RecordingPromptService/ManualPromptService (правка по
// ревью PR I2b, п. 15): модель здесь любая с датовым полем без required,
// берём BroadcastRecord — предпросмотр уже пользуется тем же полем.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { BroadcastRecord, BroadcastSchema } from '../broadcasts/broadcast.schema';
import { claimAndRun, claimOnce, releaseClaim } from './claim-once';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

describe('claimOnce', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<BroadcastRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<BroadcastRecord>(BroadcastRecord.name, BroadcastSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  async function seed() {
    return model.create({
      kind: 'manual',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'scheduled',
    });
  }

  it('поле ещё не стоит — true, ставит поле', async () => {
    const doc = await seed();

    const claimed = await claimOnce(model, doc._id, 'previewSentAt', NOW);

    expect(claimed).toBe(true);
    const updated = await model.findById(doc._id).lean();
    expect(updated?.previewSentAt).toBeInstanceOf(Date);
  });

  it('поле уже стоит — false, не перезаписывает', async () => {
    const doc = await seed();
    const earlier = NOW.minus({ minutes: 5 });
    await model.updateOne(
      { _id: doc._id },
      { $set: { previewSentAt: earlier.toJSDate() } },
    );

    const claimed = await claimOnce(model, doc._id, 'previewSentAt', NOW);

    expect(claimed).toBe(false);
    const updated = await model.findById(doc._id).lean();
    expect(updated?.previewSentAt?.toISOString()).toBe(earlier.toJSDate().toISOString());
  });

  it('гонка двух параллельных вызовов на одном документе — true ровно один раз', async () => {
    const doc = await seed();

    const [a, b] = await Promise.all([
      claimOnce(model, doc._id, 'previewSentAt', NOW),
      claimOnce(model, doc._id, 'previewSentAt', NOW),
    ]);

    expect([a, b].filter(Boolean)).toHaveLength(1);
  });
});

// Аудит 2026-09-21 (HIGH): claim стоял без try/catch — падение побочного
// эффекта между claim и концом работы навсегда теряло документ, следующий
// тик его уже не видел (поле стоит). releaseClaim/claimAndRun — починка.
describe('releaseClaim', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<BroadcastRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<BroadcastRecord>(BroadcastRecord.name, BroadcastSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('снимает отметку — поле после этого снова отсутствует', async () => {
    const doc = await model.create({
      kind: 'manual',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'scheduled',
    });
    await claimOnce(model, doc._id, 'previewSentAt', NOW);

    await releaseClaim(model, doc._id, 'previewSentAt');

    const updated = await model.findById(doc._id).lean();
    expect(updated?.previewSentAt).toBeUndefined();
  });
});

describe('claimAndRun', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<BroadcastRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<BroadcastRecord>(BroadcastRecord.name, BroadcastSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  async function seed() {
    return model.create({
      kind: 'manual',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'scheduled',
    });
  }

  it('claim не забрали — work не зовётся, onError не зовётся, false', async () => {
    const doc = await seed();
    await claimOnce(model, doc._id, 'previewSentAt', NOW); // уже забрано кем-то

    const work = jest.fn(() => Promise.resolve(true));
    const onError = jest.fn();
    const done = await claimAndRun(model, doc._id, 'previewSentAt', NOW, work, onError);

    expect(done).toBe(false);
    expect(work).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('work бросил — onError получает ошибку, поле снято, false', async () => {
    const doc = await seed();
    const error = new Error('сетевой блип к Mongo');
    const onError = jest.fn();

    const done = await claimAndRun(
      model,
      doc._id,
      'previewSentAt',
      NOW,
      () => {
        throw error;
      },
      onError,
    );

    expect(done).toBe(false);
    expect(onError).toHaveBeenCalledWith(error);
    const updated = await model.findById(doc._id).lean();
    expect(updated?.previewSentAt).toBeUndefined();
  });

  it('поле снято после сбоя — повторный claimAndRun снова выполняет work', async () => {
    const doc = await seed();
    await claimAndRun(
      model,
      doc._id,
      'previewSentAt',
      NOW,
      () => {
        throw new Error('первая попытка упала');
      },
      () => undefined,
    );

    const work = jest.fn(() => Promise.resolve(true));
    const done = await claimAndRun(
      model,
      doc._id,
      'previewSentAt',
      NOW,
      work,
      () => undefined,
    );

    expect(done).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('work отработал — поле стоит, true', async () => {
    const doc = await seed();

    const done = await claimAndRun(
      model,
      doc._id,
      'previewSentAt',
      NOW,
      () => Promise.resolve(true),
      () => undefined,
    );

    expect(done).toBe(true);
    const updated = await model.findById(doc._id).lean();
    expect(updated?.previewSentAt).toBeInstanceOf(Date);
  });
});
