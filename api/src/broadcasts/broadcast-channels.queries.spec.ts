// Против настоящей Mongo (CLAUDE.md «Тесты» — не мок модели): занятие уходит в
// каналы, чьи группы пересекаются с его группами, по одному разу; занятие без
// групп — никуда (ADR-0195, ADR-0196).
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
  const middle = new Types.ObjectId();
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

  it('занятие группы получает только каналы, где эта группа отмечена', async () => {
    const mine = await createChannel({ groupIds: [beginners] });
    await createChannel({ groupIds: [advanced] });
    await createChannel();

    const result = await findGroupChannelIds(channelModel, { groupIds: [beginners] });

    expect(result.map(String)).toEqual([mine._id.toString()]);
  });

  it('две группы занятия — объединение их каналов, без дублей', async () => {
    const first = await createChannel({ groupIds: [beginners] });
    const second = await createChannel({ groupIds: [advanced] });
    await createChannel({ groupIds: [middle] });

    const result = await findGroupChannelIds(channelModel, {
      groupIds: [beginners, advanced],
    });

    expect(result.map(String).sort()).toEqual(
      [first._id.toString(), second._id.toString()].sort(),
    );
  });

  it('канал с теми же двумя группами, что у занятия, получает занятие один раз (ADR-0196)', async () => {
    const both = await createChannel({ groupIds: [middle, advanced] });

    const result = await findGroupChannelIds(channelModel, {
      groupIds: [middle, advanced],
    });

    expect(result.map(String)).toEqual([both._id.toString()]);
  });

  it('у одной группы нет канала — занятие всё равно идёт в канал другой', async () => {
    const only = await createChannel({ groupIds: [advanced] });

    const result = await findGroupChannelIds(channelModel, {
      groupIds: [beginners, advanced],
    });

    expect(result.map(String)).toEqual([only._id.toString()]);
  });

  it('занятие без групп не уходит никуда, даже если каналы есть', async () => {
    await createChannel({ groupIds: [beginners] });
    await createChannel();

    await expect(findGroupChannelIds(channelModel, {})).resolves.toEqual([]);
    await expect(findGroupChannelIds(channelModel, { groupIds: [] })).resolves.toEqual(
      [],
    );
  });

  it('группа без канала — пусто', async () => {
    await createChannel({ groupIds: [advanced] });

    await expect(
      findGroupChannelIds(channelModel, { groupIds: [beginners] }),
    ).resolves.toEqual([]);
  });

  it('выключенный канал группы не получает занятий', async () => {
    await createChannel({ groupIds: [beginners], active: false });

    await expect(
      findGroupChannelIds(channelModel, { groupIds: [beginners] }),
    ).resolves.toEqual([]);
  });

  it('личный чат ученика не получает занятий группы', async () => {
    await createChannel({ groupIds: [beginners], broadcastEligible: false });

    await expect(
      findGroupChannelIds(channelModel, { groupIds: [beginners] }),
    ).resolves.toEqual([]);
  });
});

describe('noChannelsReason', () => {
  it('без групп — «нет группы», с группами — «нет канала»', () => {
    expect(noChannelsReason({})).toBe('у занятия нет группы');
    expect(noChannelsReason({ groupIds: [] })).toBe('у занятия нет группы');
    expect(noChannelsReason({ groupIds: [new Types.ObjectId()] })).toBe(
      'у группы занятия нет канала',
    );
  });
});
