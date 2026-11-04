// Выбор групп занятия: порядок, дубли, подпись и неизвестный id (ADR-0193).
// `selectGroups` — чистая логика без Mongo; `resolveGroupSelection` — запрос.
import { Types, type Connection, type Model } from 'mongoose';
import { InvalidInputError } from '../common/errors';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { resolveGroupSelection, selectGroups } from './group-selection';
import { GroupRecord, GroupSchema } from './group.schema';

const FIRST = { _id: new Types.ObjectId(), name: 'Начинающие' };
const SECOND = { _id: new Types.ObjectId(), name: 'Средние' };
const THIRD = { _id: new Types.ObjectId(), name: 'Старшие' };

describe('selectGroups', () => {
  it('подпись — названия через запятую в порядке создания групп, а не выбора', () => {
    const result = selectGroups([FIRST, SECOND, THIRD], [THIRD._id, FIRST._id]);

    expect(result.groupLabel).toBe('Начинающие, Старшие');
    expect(result.groupIds).toEqual([FIRST._id, THIRD._id]);
  });

  it('ids строками и ObjectId — одно и то же', () => {
    const result = selectGroups([FIRST, SECOND], [SECOND._id.toString()]);

    expect(result.groupLabel).toBe('Средние');
  });

  it('пустой выбор — пустая подпись', () => {
    expect(selectGroups([FIRST], [])).toEqual({ groupIds: [], groupLabel: '' });
  });
});

describe('resolveGroupSelection', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<GroupRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<GroupRecord>(GroupRecord.name, GroupSchema);
    await model.create([
      { ...FIRST, nameKey: 'начинающие' },
      { ...SECOND, nameKey: 'средние' },
    ]);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  it('дубли схлопываются', async () => {
    const result = await resolveGroupSelection(model, [
      SECOND._id.toString(),
      SECOND._id.toString(),
    ]);

    expect(result.groupIds).toEqual([SECOND._id]);
  });

  it('неизвестная группа — 400 с понятным текстом', async () => {
    const error: unknown = await resolveGroupSelection(model, [
      FIRST._id.toString(),
      new Types.ObjectId().toString(),
    ]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidInputError);
    expect((error as InvalidInputError).message).toContain('Такой группы нет');
  });
});
