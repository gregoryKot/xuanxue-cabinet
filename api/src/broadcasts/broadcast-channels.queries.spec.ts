// Против настоящей Mongo (CLAUDE.md «Тесты» — не мок модели): `$in` + `active`
// в одном запросе, отбор по тегу — уже поверх настоящих документов, не мока.
import { Types } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { findChannelsForLesson } from './broadcast-channels.queries';

describe('findChannelsForLesson', () => {
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

  it('в документе канала совсем нет поля tags (запись до ADR-0108) — как явный [], принимает всё', async () => {
    const channel = await createChannel();
    // default: [] подставляет Mongoose только при создании — симулируем
    // документ, заведённый до появления поля: его в базе нет вовсе.
    await channelModel.collection.updateOne(
      { _id: channel._id },
      { $unset: { tags: '' } },
    );

    const result = await findChannelsForLesson(channelModel, [channel._id], ['новички']);

    expect(result.matchingChannelIds.map(String)).toEqual([channel._id.toString()]);
  });

  it('канал без тегов — активный и подходит под любой тег занятия', async () => {
    const channel = await createChannel();

    const result = await findChannelsForLesson(channelModel, [channel._id], ['новички']);

    expect(result.activeChannelIds.map(String)).toEqual([channel._id.toString()]);
    expect(result.matchingChannelIds.map(String)).toEqual([channel._id.toString()]);
  });

  it('канал с общим тегом занятия — активный и подходит', async () => {
    const channel = await createChannel({ tags: ['новички'] });

    const result = await findChannelsForLesson(channelModel, [channel._id], ['новички']);

    expect(result.matchingChannelIds.map(String)).toEqual([channel._id.toString()]);
  });

  it('канал с чужим тегом — активный, но не подходит', async () => {
    const channel = await createChannel({ tags: ['средние'] });

    const result = await findChannelsForLesson(channelModel, [channel._id], ['новички']);

    expect(result.activeChannelIds.map(String)).toEqual([channel._id.toString()]);
    expect(result.matchingChannelIds).toEqual([]);
  });

  it('выключенный канал — ни активным, ни подходящим, даже с общим тегом', async () => {
    const channel = await createChannel({ active: false, tags: ['новички'] });

    const result = await findChannelsForLesson(channelModel, [channel._id], ['новички']);

    expect(result.activeChannelIds).toEqual([]);
    expect(result.matchingChannelIds).toEqual([]);
  });

  it('несуществующий id в списке — просто не находится, не бросает', async () => {
    const result = await findChannelsForLesson(
      channelModel,
      [new Types.ObjectId()],
      ['новички'],
    );

    expect(result.activeChannelIds).toEqual([]);
    expect(result.matchingChannelIds).toEqual([]);
  });

  it('два канала занятия: один без тегов, другой с чужим — принимает только первый', async () => {
    const openChannel = await createChannel();
    const strictChannel = await createChannel({ tags: ['средние'] });

    const result = await findChannelsForLesson(
      channelModel,
      [openChannel._id, strictChannel._id],
      ['новички'],
    );

    expect(result.activeChannelIds.map(String).sort()).toEqual(
      [openChannel._id.toString(), strictChannel._id.toString()].sort(),
    );
    expect(result.matchingChannelIds.map(String)).toEqual([openChannel._id.toString()]);
  });
});
