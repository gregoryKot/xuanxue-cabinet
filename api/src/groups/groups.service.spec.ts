// Сервис групп против настоящей Mongo (CLAUDE.md «Тесты»: запросы — не через
// мок модели). Подпись `groupLabel` у занятий проверяем read-after-write: то,
// что переименование записало, читается занятием, а не только группой.
// Счёт каналов и запрет удаления группы с занятиями или каналами (ADR-0195).
import { Types, type Connection, type Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { ClassesService } from '../classes/classes.service';
import { ConflictError, NotFoundError } from '../common/errors';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { MaterialRecord, MaterialSchema } from '../materials/material.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { GroupRecord, GroupSchema } from './group.schema';
import { GroupsService } from './groups.service';

describe('GroupsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let groupModel: Model<GroupRecord>;
  let classModel: Model<ClassRecord>;
  let channelModel: Model<ChannelRecord>;
  let groups: GroupsService;
  let classes: ClassesService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    groupModel = connection.model<GroupRecord>(GroupRecord.name, GroupSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    groups = new GroupsService(groupModel, classModel, channelModel);
    classes = new ClassesService(
      classModel,
      connection.model<LessonRecord>(LessonRecord.name, LessonSchema),
      connection.model<UserRecord>(UserRecord.name, UserSchema),
      connection.model<MaterialRecord>(MaterialRecord.name, MaterialSchema),
      groupModel,
    );
    await groupModel.syncIndexes();
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      groupModel.deleteMany({}),
      classModel.deleteMany({}),
      channelModel.deleteMany({}),
    ]);
  });

  async function classWith(title: string, ...groupIds: string[]) {
    return classes.create({ title, format: 'online', groupIds });
  }

  async function channelWith(title: string, groupIds: string[] = [], eligible = true) {
    return channelModel.create({
      type: 'manual',
      title,
      config: '{}',
      target: '',
      broadcastEligible: eligible,
      groupIds,
    });
  }

  it('list: на чистой базе — пустой список, группы идут в порядке создания', async () => {
    expect(await groups.list()).toEqual([]);

    await groups.create({ name: 'Начинающие' });
    await groups.create({ name: 'Средние' });
    await groups.create({ name: 'Старшие' });

    expect((await groups.list()).map((g) => g.name)).toEqual([
      'Начинающие',
      'Средние',
      'Старшие',
    ]);
  });

  it('list: classCount и channelCount — занятия и каналы, где группа отмечена (с несколькими группами — в каждой); личные чаты не считаются', async () => {
    const beginners = await groups.create({ name: 'Начинающие' });
    const middle = await groups.create({ name: 'Средние' });
    await classWith('А', beginners.id);
    await classWith('Б', beginners.id);
    await classWith('В', middle.id);
    await classWith('Обе', beginners.id, middle.id);
    await channelWith('Тайцзи вечер', [beginners.id]);
    await channelWith('Личный', [beginners.id], false);
    await channelWith('Для двух групп', [beginners.id, middle.id]);

    const counts = Object.fromEntries(
      (await groups.list()).map((g) => [g.name, [g.classCount, g.channelCount]]),
    );

    expect(counts).toEqual({ Начинающие: [3, 2], Средние: [2, 1] });
  });

  it('create: обрезает пробелы, отдаёт группу целиком без служебных полей', async () => {
    const created = await groups.create({ name: '  Средние  ' });

    expect(created).toMatchObject({ name: 'Средние', classCount: 0, channelCount: 0 });
    expect(created).not.toHaveProperty('nameKey');
    expect(await groups.list()).toHaveLength(1);
  });

  it('create: то же название в другом регистре — 409 с именем уже существующей группы', async () => {
    await groups.create({ name: 'Средние' });

    const error: unknown = await groups
      .create({ name: ' средние ' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toContain('«Средние»');
    expect(await groupModel.countDocuments()).toBe(1);
  });

  it('ensureByName: находит существующую по названию без учёта регистра, иначе заводит', async () => {
    const existing = await groups.create({ name: 'Средние' });

    expect(await groups.ensureByName('средние')).toBe(existing.id);

    const fresh = await groups.ensureByName('Вечерние');
    expect(fresh).not.toBe(existing.id);
    expect(await groupModel.countDocuments()).toBe(2);
  });

  it('rename: переписывает подпись у каждого занятия с этой группой, в том числе с несколькими, чужие не трогает', async () => {
    const beginners = await groups.create({ name: 'Начинающие' });
    const middle = await groups.create({ name: 'Средние' });
    await classWith('Одна', middle.id);
    await classWith('Две', middle.id);
    await classWith('Чужая', beginners.id);
    await classWith('Обе', beginners.id, middle.id);

    const renamed = await groups.rename(middle.id, { name: 'Продолжающие' });

    expect(renamed).toMatchObject({ name: 'Продолжающие', classCount: 3 });
    const labels = Object.fromEntries(
      (await classModel.find().lean()).map((c) => [c.title, c.groupLabel]),
    );
    expect(labels).toEqual({
      Одна: 'Продолжающие',
      Две: 'Продолжающие',
      Чужая: 'Начинающие',
      Обе: 'Начинающие, Продолжающие',
    });
  });

  it('rename: в название другой группы — 409, подписи не тронуты', async () => {
    const beginners = await groups.create({ name: 'Начинающие' });
    const middle = await groups.create({ name: 'Средние' });
    await classWith('А', middle.id);

    await expect(groups.rename(middle.id, { name: 'начинающие' })).rejects.toBeInstanceOf(
      ConflictError,
    );

    expect((await classModel.findOne({ title: 'А' }).lean())?.groupLabel).toBe('Средние');
    expect(beginners.name).toBe('Начинающие');
  });

  it('rename: смена регистра своего же названия — не конфликт', async () => {
    const group = await groups.create({ name: 'средние' });

    const renamed = await groups.rename(group.id, { name: 'Средние' });

    expect(renamed.name).toBe('Средние');
  });

  it('rename: неизвестный и негодный id — 404', async () => {
    const missing = new Types.ObjectId().toString();

    await expect(groups.rename(missing, { name: 'Х' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(groups.rename('не-id', { name: 'Х' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('remove: группа у занятий — 409 с числом занятий, группа осталась', async () => {
    const group = await groups.create({ name: 'Средние' });
    await classWith('А', group.id);
    await classWith('Б', group.id);

    const error: unknown = await groups.remove(group.id).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toContain('занятий: 2');
    expect((error as ConflictError).message).not.toContain('каналов');
    expect(await groupModel.countDocuments()).toBe(1);
  });

  it('remove: группа у канала — 409 с числом каналов; у занятий и каналов — оба названы', async () => {
    const onlyChannel = await groups.create({ name: 'Старшие' });
    const both = await groups.create({ name: 'Средние' });
    await channelWith('Канал', [onlyChannel.id]);
    await channelWith('Другой', [both.id]);
    await classWith('А', both.id);

    const first: unknown = await groups.remove(onlyChannel.id).catch((e: unknown) => e);
    const second: unknown = await groups.remove(both.id).catch((e: unknown) => e);

    expect((first as ConflictError).message).toContain('каналов: 1');
    expect((first as ConflictError).message).not.toContain('занятий');
    expect((second as ConflictError).message).toContain('занятий: 1 и каналов: 1');
    expect(await groupModel.countDocuments()).toBe(2);
  });

  it('remove: группа без занятий и каналов удаляется; повторное удаление — 404', async () => {
    const group = await groups.create({ name: 'Лишняя' });

    await groups.remove(group.id);

    expect(await groupModel.countDocuments()).toBe(0);
    await expect(groups.remove(group.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('remove: после того как занятие и канал сняли группу, её можно удалить', async () => {
    const group = await groups.create({ name: 'Средние' });
    const cls = await classWith('А', group.id);
    const channel = await channelWith('Канал', [group.id]);
    await classes.update(cls.id, { groupIds: [] });
    await channelModel.updateOne({ _id: channel._id }, { $set: { groupIds: [] } });

    await groups.remove(group.id);

    expect(await groupModel.countDocuments()).toBe(0);
  });
});
