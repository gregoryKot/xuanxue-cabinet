// Против настоящей Mongo: список занятий для галочек «о каких занятиях»
// (ADR-0162). Главное — чего в ответе нет: ответ видит ученик, и ссылка Zoom с
// паролем, каналы и теги оттуда не уходят (SECURITY, ADR-0072).
import type { Model } from 'mongoose';
import { ClassRecord } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { listLessonScopeClasses } from './lesson-scope-classes';

describe('listLessonScopeClasses', () => {
  let memory: MemoryMongo;
  let model: Model<ClassRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<ClassRecord>(ClassRecord.name);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  function createClass(overrides: Partial<ClassRecord> = {}) {
    return model.create({
      title: 'Тайцзи',
      groupLabel: '',
      format: 'online',
      tz: 'Asia/Jerusalem',
      rules: [{ weekday: 2, time: '19:00', durationMin: 60 }],
      ...overrides,
    });
  }

  it('пустая школа — пустой список', async () => {
    expect(await listLessonScopeClasses(model)).toEqual([]);
  });

  it('выключенное занятие в списке не появляется', async () => {
    await createClass({ title: 'Живое' });
    await createClass({ title: 'Выключенное', active: false });

    const classes = await listLessonScopeClasses(model);

    expect(classes.map((c) => c.title)).toEqual(['Живое']);
  });

  it('у занятия ровно пять полей: секретов нет, даже когда они заполнены', async () => {
    const created = await createClass({
      title: 'Цигун',
      groupLabel: 'Утро',
      zoomLink: 'https://zoom.us/j/123',
      zoomPassword: 'секрет',
      tags: ['начинающие'],
      leadMinutes: 45,
      rules: [
        { weekday: 0, time: '08:00', durationMin: 45 },
        { weekday: 3, time: '19:30', durationMin: 60 },
      ],
    });

    const [item] = await listLessonScopeClasses(model);

    expect(Object.keys(item ?? {}).sort()).toEqual([
      'groupLabel',
      'id',
      'slots',
      'title',
      'tz',
    ]);
    expect(item).toEqual({
      id: created._id.toString(),
      title: 'Цигун',
      groupLabel: 'Утро',
      tz: 'Asia/Jerusalem',
      slots: [
        { weekday: 0, time: '08:00', durationMin: 45 },
        { weekday: 3, time: '19:30', durationMin: 60 },
      ],
    });
  });

  it('слот — только день, время и длительность, без id субдокумента', async () => {
    await createClass();

    const [item] = await listLessonScopeClasses(model);

    expect(Object.keys(item?.slots[0] ?? {}).sort()).toEqual([
      'durationMin',
      'time',
      'weekday',
    ]);
  });

  // ADR-0168: ученику хватает «раз в 2 недели» — дата первого занятия в слот
  // не попадает.
  it('слот раз в две недели несёт everyWeeks, но не дату первого занятия', async () => {
    await createClass({
      rules: [
        {
          weekday: 5,
          time: '20:00',
          durationMin: 90,
          everyWeeks: 2,
          startsOn: '2026-10-02',
        },
      ],
    });

    const [item] = await listLessonScopeClasses(model);

    expect(item?.slots).toEqual([
      { weekday: 5, time: '20:00', durationMin: 90, everyWeeks: 2 },
    ]);
    expect(item?.slots[0]).not.toHaveProperty('startsOn');
  });

  it('занятие без слотов — пустой список слотов', async () => {
    await createClass({ rules: [] });

    const [item] = await listLessonScopeClasses(model);

    expect(item?.slots).toEqual([]);
  });

  it('документ без groupLabel и tz (старше этих полей) получает пустую подпись и пояс школы', async () => {
    await model.collection.insertOne({
      title: 'Старое',
      format: 'online',
      active: true,
      rules: [],
    });

    const [item] = await listLessonScopeClasses(model);

    expect(item).toMatchObject({ title: 'Старое', groupLabel: '', tz: 'Asia/Jerusalem' });
  });

  it('порядок: по названию по алфавиту (заглавная не выше строчной), при равном названии — по подписи группы', async () => {
    await createClass({ title: 'Яшма', groupLabel: '' });
    await createClass({ title: 'арбуз', groupLabel: '' });
    await createClass({ title: 'Цигун', groupLabel: 'Вечер' });
    await createClass({ title: 'Цигун', groupLabel: 'Утро' });

    const classes = await listLessonScopeClasses(model);

    expect(classes.map((c) => `${c.title}/${c.groupLabel}`)).toEqual([
      'арбуз/',
      'Цигун/Вечер',
      'Цигун/Утро',
      'Яшма/',
    ]);
  });

  it('полностью одинаковые занятия идут в стабильном порядке — по id', async () => {
    const first = await createClass({ title: 'Тайцзи' });
    const second = await createClass({ title: 'Тайцзи' });

    const classes = await listLessonScopeClasses(model);

    expect(classes.map((c) => c.id)).toEqual([
      first._id.toString(),
      second._id.toString(),
    ]);
  });
});
