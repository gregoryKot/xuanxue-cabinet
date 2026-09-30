// Против настоящей Mongo: GET/PUT «о каких занятиях» (ADR-0162) на сервисе, без
// HTTP. Главное — несуществующее занятие отклоняется, и ничего не записано.
import { Types, type Model } from 'mongoose';
import { ClassRecord } from '../classes/class.schema';
import { InvalidInputError } from '../common/errors';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { LessonNotificationsService } from './lesson-notifications.service';
import { LessonScopeService } from './lesson-scope.service';
import { NotificationPrefsRecord } from './notification-prefs.schema';

describe('LessonNotificationsService', () => {
  let memory: MemoryMongo;
  let classModel: Model<ClassRecord>;
  let prefsModel: Model<NotificationPrefsRecord>;
  let service: LessonNotificationsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    classModel = memory.connection.model<ClassRecord>(ClassRecord.name);
    prefsModel = memory.connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
    service = new LessonNotificationsService(
      classModel,
      new LessonScopeService(prefsModel),
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([classModel.deleteMany({}), prefsModel.deleteMany({})]);
  });

  function createClass(overrides: Partial<ClassRecord> = {}) {
    return classModel.create({ title: 'Тайцзи', format: 'online', ...overrides });
  }

  it('без выбора: «все», и список активных занятий', async () => {
    const cls = await createClass();
    await createClass({ title: 'Выключенное', active: false });

    const result = await service.get('u1');

    expect(result.scope).toEqual({ mode: 'all', classIds: [] });
    expect(result.classes.map((c) => c.id)).toEqual([cls._id.toString()]);
  });

  it('PUT отвечает тем, что потом покажет GET (read-after-write, ADR-0087)', async () => {
    const cls = await createClass();

    const written = await service.update('u1', {
      mode: 'selected',
      classIds: [cls._id.toString()],
    });

    expect(written.scope).toEqual({ mode: 'selected', classIds: [cls._id.toString()] });
    expect(await service.get('u1')).toEqual(written);
  });

  it('несуществующее занятие — 400 с текстом, выбор не записан', async () => {
    const cls = await createClass();
    await service.update('u1', { mode: 'selected', classIds: [cls._id.toString()] });

    const gone = new Types.ObjectId().toString();
    const attempt = service.update('u1', {
      mode: 'selected',
      classIds: [cls._id.toString(), gone],
    });

    await expect(attempt).rejects.toBeInstanceOf(InvalidInputError);
    await expect(attempt).rejects.toThrow('Такого занятия больше нет в расписании');
    expect((await service.get('u1')).scope.classIds).toEqual([cls._id.toString()]);
  });

  it('повторы одного настоящего id не считаются несуществующими занятиями', async () => {
    const cls = await createClass();
    const id = cls._id.toString();

    const written = await service.update('u1', { mode: 'selected', classIds: [id, id] });

    expect(written.scope.classIds).toEqual([id]);
  });

  it('выключенное занятие принимается: оно существует, учитель мог выключить его позже', async () => {
    const cls = await createClass({ active: false });

    const written = await service.update('u1', {
      mode: 'selected',
      classIds: [cls._id.toString()],
    });

    expect(written.scope.classIds).toEqual([cls._id.toString()]);
    expect(written.classes).toEqual([]);
  });

  it('пустой список не ходит в базу занятий и принимается в любом режиме', async () => {
    const written = await service.update('u1', { mode: 'selected', classIds: [] });

    expect(written.scope).toEqual({ mode: 'selected', classIds: [] });
  });
});
