// Против настоящей Mongo (CLAUDE.md «Тесты») — фильтр и сортировка «ещё жду
// запись» (ADR-0175) живут в самом запросе, мок модели их бы пропустил.
// pendingTail — чистая функция, проверяется тут же.
import { DateTime } from 'luxon';
import type { Connection, Model, Types } from 'mongoose';
import { ClassRecord, ClassSchema } from '../../classes/class.schema';
import { LessonRecord, LessonSchema } from '../../lessons/lesson.schema';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import { RECORDING_WAIT_HOURS } from '../recording-wait';
import { listPendingRecordings, pendingTail } from './recording-pending';

// Зима: Asia/Jerusalem = UTC+2, 19:10 UTC → 21:10 по классу.
const NOW = DateTime.fromISO('2026-01-12T19:30:00Z', { zone: 'utc' });
const ZONE = 'Asia/Jerusalem';

function localTime(startsAt: DateTime): string {
  return startsAt.setZone(ZONE).toFormat('HH:mm');
}

describe('listPendingRecordings', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([lessonModel.deleteMany({}), classModel.deleteMany({})]);
  });

  async function createClass(overrides: Partial<ClassRecord> = {}) {
    return classModel.create({
      title: 'цигун для глаз',
      groupLabel: '',
      format: 'online',
      tz: ZONE,
      leadMinutes: 30,
      active: true,
      channelIds: [],
      ...overrides,
    });
  }

  // По умолчанию — занятие, о котором бот спросил 10 минут назад.
  async function createLesson(
    classId: Types.ObjectId,
    overrides: Partial<LessonRecord> & { startsAt?: Date } = {},
  ) {
    return lessonModel.create({
      classId,
      startsAt: NOW.minus({ hours: 1, minutes: 20 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
      recordingPromptedAt: NOW.minus({ minutes: 10 }).toJSDate(),
      ...overrides,
    });
  }

  it('занятия по возрастанию startsAt, подпись «название · группа» HH:mm по поясу класса', async () => {
    const cls = await createClass({ groupLabel: 'средняя группа' });
    const late = NOW.minus({ hours: 1 });
    const early = NOW.minus({ hours: 3 });
    const lateLesson = await createLesson(cls._id, { startsAt: late.toJSDate() });
    const earlyLesson = await createLesson(cls._id, { startsAt: early.toJSDate() });

    const pending = await listPendingRecordings(lessonModel, classModel, NOW);

    expect(pending).toEqual([
      {
        id: earlyLesson._id.toString(),
        label: `«цигун для глаз · средняя группа» ${localTime(early)}`,
      },
      {
        id: lateLesson._id.toString(),
        label: `«цигун для глаз · средняя группа» ${localTime(late)}`,
      },
    ]);
    expect(pending[1]?.label.endsWith('20:30')).toBe(true);
  });

  it('пустая база — пустой список', async () => {
    expect(await listPendingRecordings(lessonModel, classModel, NOW)).toEqual([]);
  });

  it('с записью, отклонённые, спрошенные давно, не спрошенные и отменённые не попадают', async () => {
    const cls = await createClass();
    const wanted = await createLesson(cls._id);
    await createLesson(cls._id, {
      recordings: [{ title: 'запись', url: 'https://youtu.be/abc' }],
    });
    await createLesson(cls._id, { recordingDeclinedAt: NOW.toJSDate() });
    await createLesson(cls._id, {
      recordingPromptedAt: NOW.minus({
        hours: RECORDING_WAIT_HOURS,
        minutes: 1,
      }).toJSDate(),
    });
    await createLesson(cls._id, { recordingPromptedAt: undefined });
    await createLesson(cls._id, { status: 'cancelled' });

    const pending = await listPendingRecordings(lessonModel, classModel, NOW);

    expect(pending.map((p) => p.id)).toEqual([wanted._id.toString()]);
  });

  it('спрошено ровно RECORDING_WAIT_HOURS назад — ещё в списке', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id, {
      recordingPromptedAt: NOW.minus({ hours: RECORDING_WAIT_HOURS }).toJSDate(),
    });

    const pending = await listPendingRecordings(lessonModel, classModel, NOW);

    expect(pending.map((p) => p.id)).toEqual([lesson._id.toString()]);
  });

  it('класс удалён — занятие пропускается, остальные остаются', async () => {
    const cls = await createClass();
    const gone = await createClass({ title: 'ушу' });
    await createLesson(gone._id);
    const kept = await createLesson(cls._id);
    await classModel.deleteOne({ _id: gone._id });

    const pending = await listPendingRecordings(lessonModel, classModel, NOW);

    expect(pending.map((p) => p.id)).toEqual([kept._id.toString()]);
  });

  it('не больше 10 занятий — самые ранние', async () => {
    const cls = await createClass();
    for (let i = 0; i < 12; i += 1) {
      await createLesson(cls._id, {
        startsAt: NOW.minus({ hours: 2, minutes: i }).toJSDate(),
      });
    }

    const pending = await listPendingRecordings(lessonModel, classModel, NOW);

    expect(pending).toHaveLength(10);
  });
});

describe('pendingTail', () => {
  it('нечего ждать — пустая строка', () => {
    expect(pendingTail([])).toBe('');
  });

  it('одно занятие — «Ещё жду запись к …»', () => {
    expect(pendingTail([{ id: '1', label: '«цигун» 21:10' }])).toBe(
      ' Ещё жду запись к «цигун» 21:10.',
    );
  });

  it('два занятия — «Ещё жду записи: …, ….»', () => {
    expect(
      pendingTail([
        { id: '1', label: '«цигун» 21:10' },
        { id: '2', label: '«ушу» 22:00' },
      ]),
    ).toBe(' Ещё жду записи: «цигун» 21:10, «ушу» 22:00.');
  });
});
