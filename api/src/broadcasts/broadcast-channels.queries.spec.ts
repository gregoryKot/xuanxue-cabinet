// Против настоящей Mongo (CLAUDE.md «Тесты» — не мок модели): занятие уходит в
// каналы своей группы, занятие «для всех групп» — в каналы с любой группой,
// занятие без группы — никуда (ADR-0195).
import { Types } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { findGroupChannelIds, noChannelsReason } from './broadcast-channels.queries';

describe('findGroupChannelIds', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let channelModel: Model<ChannelRecord>;
  const beginners = new Types.ObjectId();
  const advanced = new Types.ObjectId();

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

  it('занятие группы получает только каналы этой группы', async () => {
    const mine = await createChannel({ groupId: beginners });
    await createChannel({ groupId: advanced });
    await createChannel();

    const result = await findGroupChannelIds(channelModel, { groupId: beginners });

    expect(result.map(String)).toEqual([mine._id.toString()]);
  });

  it('занятие без группы не уходит никуда, даже если каналы есть', async () => {
    await createChannel({ groupId: beginners });
    await createChannel();

    await expect(findGroupChannelIds(channelModel, {})).resolves.toEqual([]);
  });

  it('группа без канала — пусто', async () => {
    await createChannel({ groupId: advanced });

    await expect(
      findGroupChannelIds(channelModel, { groupId: beginners }),
    ).resolves.toEqual([]);
  });

  it('выключенный канал группы не получает занятий', async () => {
    await createChannel({ groupId: beginners, active: false });

    await expect(
      findGroupChannelIds(channelModel, { groupId: beginners }),
    ).resolves.toEqual([]);
  });

  it('личный чат ученика не получает занятий группы', async () => {
    await createChannel({ groupId: beginners, broadcastEligible: false });

    await expect(
      findGroupChannelIds(channelModel, { groupId: beginners }),
    ).resolves.toEqual([]);
  });

  it('занятие для всех групп идёт в каждый канал с группой и не идёт в канал без неё', async () => {
    const first = await createChannel({ groupId: beginners });
    const second = await createChannel({ groupId: advanced });
    await createChannel();
    await createChannel({ groupId: advanced, broadcastEligible: false });

    const result = await findGroupChannelIds(channelModel, { forAllGroups: true });

    expect(result.map(String).sort()).toEqual(
      [first._id.toString(), second._id.toString()].sort(),
    );
  });

  it('ни у одного канала нет группы — занятию для всех групп пусто', async () => {
    await createChannel();

    await expect(
      findGroupChannelIds(channelModel, { forAllGroups: true }),
    ).resolves.toEqual([]);
  });
});

describe('noChannelsReason', () => {
  it('без группы — «нет группы», с группой или для всех — «нет канала»', () => {
    expect(noChannelsReason({})).toBe('у занятия нет группы');
    expect(noChannelsReason({ groupId: new Types.ObjectId() })).toBe(
      'у группы занятия нет канала',
    );
    expect(noChannelsReason({ forAllGroups: true })).toBe('у группы занятия нет канала');
  });
});
