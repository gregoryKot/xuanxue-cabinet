// Против настоящей Mongo (CLAUDE.md «Тесты» — не мок модели): `$in` + `active`
// в одном запросе. Теги канала в отборе не участвуют (ADR-0192).
import { Types } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { findActiveChannelIds } from './broadcast-channels.queries';

describe('findActiveChannelIds', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let channelModel: Model<ChannelRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await channelModel.deleteMany({});
  });

  async function createChannel(overrides: Partial<ChannelRecord> = {}) {
    return channelModel.create({
      type: 'telegram',
      title: 'Канал школы',
      config: '{}',
      target: '',
      active: true,
      ...overrides,
    });
  }

  it('активный канал из списка занятия — находится', async () => {
    const channel = await createChannel();

    const result = await findActiveChannelIds(channelModel, [channel._id]);

    expect(result.map(String)).toEqual([channel._id.toString()]);
  });

  it('выключенный канал — не находится', async () => {
    const channel = await createChannel({ active: false });

    await expect(findActiveChannelIds(channelModel, [channel._id])).resolves.toEqual([]);
  });

  it('канал вне списка занятия — не находится, даже активный', async () => {
    const inList = await createChannel();
    await createChannel();

    const result = await findActiveChannelIds(channelModel, [inList._id]);

    expect(result.map(String)).toEqual([inList._id.toString()]);
  });

  it('несуществующий id в списке — просто не находится, не бросает', async () => {
    await expect(
      findActiveChannelIds(channelModel, [new Types.ObjectId()]),
    ).resolves.toEqual([]);
  });

  it('остаток старого поля tags в документе канала ничего не отсеивает (ADR-0192)', async () => {
    const channel = await createChannel();
    await channelModel.collection.updateOne(
      { _id: channel._id },
      { $set: { tags: ['средние'] } },
    );

    const result = await findActiveChannelIds(channelModel, [channel._id]);

    expect(result.map(String)).toEqual([channel._id.toString()]);
  });
});
