// Группы из подписей занятий — против настоящей Mongo. Занятия кладём «старым
// кодом»: коллекцией напрямую, без `groupIds`, как они лежат на проде до
// миграции; читаем потом моделью (read-after-write).
import type { Connection, Model, Types } from 'mongoose';
import { ClassRecord } from '../classes/class.schema';
import { GroupRecord } from '../groups/group.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { groupsFromLabels } from './0027-groups-from-labels.migration';

describe('Миграция 0027-groups-from-labels', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let classes: Model<ClassRecord>;
  let groups: Model<GroupRecord>;

  function db() {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    classes = connection.model<ClassRecord>(ClassRecord.name);
    groups = connection.model<GroupRecord>(GroupRecord.name);
    await groups.syncIndexes();
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await Promise.all([classes.deleteMany({}), groups.deleteMany({})]);
  });

  /** Занятие как до ADR-0193: подпись есть, поля `groupIds` в документе нет. */
  async function legacyClass(title: string, groupLabel: string | undefined) {
    const doc: Record<string, unknown> = {
      title,
      format: 'online',
      rules: [],
      tz: 'Asia/Jerusalem',
      channelIds: [],
      leadMinutes: 30,
      active: true,
    };
    if (groupLabel !== undefined) doc.groupLabel = groupLabel;
    await db().collection('classes').insertOne(doc);
  }

  async function labelOf(title: string): Promise<{ ids: string[]; label: string }> {
    // `groupIds` схема больше не знает (ADR-0195), 0027 его пишет напрямую.
    const doc = await classes
      .findOne({ title })
      .lean<ClassRecord & { groupIds?: Types.ObjectId[] }>();
    const names = new Map(
      (await groups.find().lean()).map((g) => [g._id.toString(), g.name]),
    );
    return {
      ids: (doc?.groupIds ?? []).map((id) => names.get(id.toString()) ?? '?'),
      label: doc?.groupLabel ?? '',
    };
  }

  it('заводит три группы школы по порядку, даже если занятий нет', async () => {
    await groupsFromLabels.up(db());

    const created = await groups.find().sort({ _id: 1 }).lean();
    expect(created.map((g) => g.name)).toEqual(['Начинающие', 'Средние', 'Старшие']);
    expect(created.map((g) => g.nameKey)).toEqual(['начинающие', 'средние', 'старшие']);
  });

  it.each([
    ['новички', ['Начинающие']],
    ['начинающие', ['Начинающие']],
    ['младшая группа', ['Начинающие']],
    ['средняя группа', ['Средние']],
    ['старшая группа', ['Старшие']],
    ['продвинутые', ['Старшие']],
    ['  Средняя Группа ', ['Средние']],
  ])('подпись «%s» → %j', async (label, expected) => {
    await legacyClass('Курс', label);

    await groupsFromLabels.up(db());

    expect(await labelOf('Курс')).toEqual({ ids: expected, label: expected.join(', ') });
  });

  it('«все группы» → все три, подпись — склейка в порядке создания', async () => {
    await legacyClass('Курс', 'все группы');

    await groupsFromLabels.up(db());

    expect(await labelOf('Курс')).toEqual({
      ids: ['Начинающие', 'Средние', 'Старшие'],
      label: 'Начинающие, Средние, Старшие',
    });
  });

  it('пустая подпись и занятие без поля — без групп, подпись пустая', async () => {
    await legacyClass('Пустая', '');
    await legacyClass('Без поля', undefined);

    await groupsFromLabels.up(db());

    expect(await labelOf('Пустая')).toEqual({ ids: [], label: '' });
    expect(await labelOf('Без поля')).toEqual({ ids: [], label: '' });
  });

  it('подпись не из списка не теряется: заводится своя группа и попадает в отчёт', async () => {
    await legacyClass('А', 'четверг');
    await legacyClass('Б', 'Четверг');

    const report = await groupsFromLabels.up(db());

    expect(await labelOf('А')).toEqual({ ids: ['четверг'], label: 'четверг' });
    // Тот же ключ, другое написание — одна группа, написание первой.
    expect(await labelOf('Б')).toEqual({ ids: ['четверг'], label: 'четверг' });
    expect(await groups.countDocuments()).toBe(4);
    expect(report.join('\n')).toContain('«четверг» не из списка');
  });

  it('подпись, совпавшая с названием группы школы, берёт её, а не заводит вторую', async () => {
    await legacyClass('Курс', 'Средние');

    await groupsFromLabels.up(db());

    expect(await labelOf('Курс')).toEqual({ ids: ['Средние'], label: 'Средние' });
    expect(await groups.countDocuments()).toBe(3);
  });

  it('повторный запуск ничего не меняет, а занятия с groupIds пропускаются', async () => {
    await legacyClass('Курс', 'новички');
    await groupsFromLabels.up(db());
    const before = await classes.find().lean();
    const groupsBefore = await groups.find().lean();
    // Учитель уже выбрал группу сам — повтор не должен её переписать.
    const [, middle] = await groups.find().sort({ _id: 1 }).lean();
    await db()
      .collection('classes')
      .updateOne(
        { title: 'Курс' },
        { $set: { groupIds: [middle?._id], groupLabel: 'Средние' } },
      );

    const report = await groupsFromLabels.up(db());

    expect(report[0]).toContain(': 0');
    expect(await labelOf('Курс')).toEqual({ ids: ['Средние'], label: 'Средние' });
    expect(await groups.find().lean()).toEqual(groupsBefore);
    expect(before).toHaveLength(1);
  });
});
