// Против настоящей Mongo (CLAUDE.md «Тесты») — общий claimOnce делит
// PreviewService/RecordingPromptService/ManualPromptService (правка по
// ревью PR I2b, п. 15): модель здесь любая с датовым полем без required,
// берём BroadcastRecord — предпросмотр уже пользуется тем же полем.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { BroadcastRecord, BroadcastSchema } from '../broadcasts/broadcast.schema';
import { claimOnce } from './claim-once';

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
