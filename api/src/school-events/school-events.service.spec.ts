// Против настоящей Mongo (mongodb-memory-server, CLAUDE.md «Тесты»): запись и
// чтение, проверка дат при PATCH, список ученика, шифрование. ENCRYPTION_KEY —
// из test/jest.setup.ts. «Сейчас» передаётся явно — часы машины не участвуют.
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import {
  MY_SCHOOL_EVENTS_LIMIT,
  SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE,
} from '@xuanxue/shared';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { SchoolEventRecord, SchoolEventSchema } from './school-event.schema';
import { SchoolEventsService } from './school-events.service';

const AUTHOR_ID = new Types.ObjectId().toString();
const NOW = DateTime.fromISO('2026-11-11T10:00:00Z', { zone: 'utc' });

describe('SchoolEventsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<SchoolEventRecord>;
  let service: SchoolEventsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<SchoolEventRecord>(
      SchoolEventRecord.name,
      SchoolEventSchema,
    );
    service = new SchoolEventsService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('create → list: событие сразу видно штату (read-after-write)', async () => {
    const created = await service.create(
      {
        title: 'Ретрит',
        startsAt: '2026-11-20T07:00:00Z',
        endsAt: '2026-11-22T15:00:00Z',
        place: 'Амиад',
        description: 'Что **взять**',
      },
      AUTHOR_ID,
    );

    const list = await service.list({});

    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(created);
    expect(created).toMatchObject({
      title: 'Ретрит',
      startsAt: '2026-11-20T07:00:00.000Z',
      endsAt: '2026-11-22T15:00:00.000Z',
      place: 'Амиад',
      description: 'Что **взять**',
      createdBy: AUTHOR_ID,
    });
  });

  it('create: конец раньше начала — InvalidInputError, в базу ничего не пишется', async () => {
    await expect(
      service.create(
        {
          title: 'Ретрит',
          startsAt: '2026-11-20T07:00:00Z',
          endsAt: '2026-11-19T07:00:00Z',
        },
        AUTHOR_ID,
      ),
    ).rejects.toMatchObject({ message: SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE });
    expect(await model.countDocuments()).toBe(0);
  });

  it('list штата: по убыванию начала и с лимитом', async () => {
    for (const day of ['10', '30', '20']) {
      await service.create(
        { title: `День ${day}`, startsAt: `2026-11-${day}T07:00:00Z` },
        AUTHOR_ID,
      );
    }

    expect((await service.list({})).map((e) => e.title)).toEqual([
      'День 30',
      'День 20',
      'День 10',
    ]);
    expect(await service.list({ limit: 1 })).toHaveLength(1);
  });

  it('update: place: null стирает поле, остальное не трогает', async () => {
    const created = await service.create(
      {
        title: 'Семинар',
        startsAt: '2026-11-20T07:00:00Z',
        place: 'Зал',
        description: 'Текст',
      },
      AUTHOR_ID,
    );

    const updated = await service.update(created.id, { place: null });

    expect(updated.place).toBeUndefined();
    expect(updated.description).toBe('Текст');
    const raw = await model.collection.findOne({ _id: new Types.ObjectId(created.id) });
    expect(raw).not.toHaveProperty('place');
    expect((await service.list({}))[0]?.place).toBeUndefined();
  });

  it('update: endsAt: null и новое начало вместе — событие в один момент', async () => {
    const created = await service.create(
      {
        title: 'Ретрит',
        startsAt: '2026-11-20T07:00:00Z',
        endsAt: '2026-11-22T15:00:00Z',
      },
      AUTHOR_ID,
    );

    const updated = await service.update(created.id, {
      startsAt: '2026-12-01T07:00:00Z',
      endsAt: null,
    });

    expect(updated.startsAt).toBe('2026-12-01T07:00:00.000Z');
    expect(updated.endsAt).toBeUndefined();
  });

  it('update: начало позже сохранённого конца — ошибка, событие не меняется', async () => {
    const created = await service.create(
      {
        title: 'Ретрит',
        startsAt: '2026-11-20T07:00:00Z',
        endsAt: '2026-11-22T15:00:00Z',
      },
      AUTHOR_ID,
    );

    await expect(
      service.update(created.id, { startsAt: '2026-12-01T07:00:00Z' }),
    ).rejects.toMatchObject({ message: SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE });
    expect((await service.list({}))[0]?.startsAt).toBe('2026-11-20T07:00:00.000Z');
  });

  it('update и remove несуществующего или кривого id — 404', async () => {
    const missing = new Types.ObjectId().toString();

    await expect(service.update(missing, { title: 'x' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.update('не-id', { title: 'x' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.remove(missing)).rejects.toMatchObject({ status: 404 });
  });

  it('remove: событие пропадает, второй remove — 404', async () => {
    const created = await service.create(
      { title: 'Выезд', startsAt: '2026-11-20T07:00:00Z' },
      AUTHOR_ID,
    );

    await service.remove(created.id);

    expect(await service.list({})).toHaveLength(0);
    await expect(service.remove(created.id)).rejects.toMatchObject({ status: 404 });
  });

  it('title, place и description зашифрованы в сырой Mongo', async () => {
    const created = await service.create(
      {
        title: 'Секретное название',
        startsAt: '2026-11-20T07:00:00Z',
        place: 'Секретное место',
        description: 'Секретные подробности',
      },
      AUTHOR_ID,
    );

    const raw = await model.collection.findOne<Record<string, unknown>>({
      _id: new Types.ObjectId(created.id),
    });

    expect(raw?.title).not.toBe('Секретное название');
    expect(raw?.place).not.toBe('Секретное место');
    expect(raw?.description).not.toBe('Секретные подробности');
    expect(raw?.startsAt).toBeInstanceOf(Date);
  });

  describe('listUpcoming (доска ученика)', () => {
    async function seed(title: string, startsAt: string, endsAt?: string): Promise<void> {
      await service.create({ title, startsAt, endsAt }, AUTHOR_ID);
    }

    it('прошедшее не приходит, идущее многодневное и будущее — приходят', async () => {
      await seed('Прошло без конца', '2026-11-10T07:00:00Z');
      await seed('Прошло с концом', '2026-11-08T07:00:00Z', '2026-11-10T15:00:00Z');
      await seed('Идёт сейчас', '2026-11-09T07:00:00Z', '2026-11-12T15:00:00Z');
      await seed('Впереди', '2026-12-01T07:00:00Z');

      const titles = (await service.listUpcoming(NOW)).map((e) => e.title);

      expect(titles).toEqual(['Идёт сейчас', 'Впереди']);
    });

    it('событие без конца, начавшееся минуту назад, уже не предстоящее', async () => {
      await seed('Только что началось', '2026-11-11T09:59:00Z');
      await seed('Через минуту', '2026-11-11T10:01:00Z');

      const titles = (await service.listUpcoming(NOW)).map((e) => e.title);

      expect(titles).toEqual(['Через минуту']);
    });

    it('порядок — по возрастанию начала', async () => {
      await seed('Третье', '2026-12-30T07:00:00Z');
      await seed('Первое', '2026-11-20T07:00:00Z');
      await seed('Второе', '2026-12-10T07:00:00Z');

      const titles = (await service.listUpcoming(NOW)).map((e) => e.title);

      expect(titles).toEqual(['Первое', 'Второе', 'Третье']);
    });

    it('не больше MY_SCHOOL_EVENTS_LIMIT, самые ближайшие', async () => {
      const total = MY_SCHOOL_EVENTS_LIMIT + 3;
      await model.insertMany(
        Array.from({ length: total }, (_, i) => ({
          title: `Событие ${i}`,
          startsAt: NOW.plus({ days: i + 1 }).toJSDate(),
        })),
      );

      const list = await service.listUpcoming(NOW);

      expect(list).toHaveLength(MY_SCHOOL_EVENTS_LIMIT);
      expect(list[0]?.startsAt).toBe(NOW.plus({ days: 1 }).toUTC().toISO());
    });

    it('пустая база — пустой список', async () => {
      expect(await service.listUpcoming(NOW)).toEqual([]);
    });
  });
});
