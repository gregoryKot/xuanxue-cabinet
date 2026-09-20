// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): шифрование секретов и read-after-write, PATCH null → $unset,
// запрет удаления класса с занятиями (clarification 7 ТЗ PR D).
import { Types, type Connection, type Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { ClassRecord, ClassSchema } from './class.schema';
import { ClassesService } from './classes.service';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { MaterialRecord, MaterialSchema } from '../materials/material.schema';
import { UserRecord, UserSchema } from '../users/user.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('ClassesService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<ClassRecord>;
  let lessonModel: Model<LessonRecord>;
  let channelModel: Model<ChannelRecord>;
  let userModel: Model<UserRecord>;
  let materialModel: Model<MaterialRecord>;
  let service: ClassesService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    materialModel = connection.model<MaterialRecord>(MaterialRecord.name, MaterialSchema);
    service = new ClassesService(
      model,
      lessonModel,
      channelModel,
      userModel,
      materialModel,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
    await lessonModel.deleteMany({});
    await channelModel.deleteMany({});
    await userModel.deleteMany({});
    await materialModel.deleteMany({});
  });

  it('create → getById: read-after-write, zoomLink расшифрован в ответе', async () => {
    const created = await service.create({
      title: 'Тайцзицюань',
      format: 'online',
      zoomLink: 'https://us02web.zoom.us/j/123',
    });

    // .findById().lean() без decryptRecord — то, что реально лежит в базе,
    // без прохода через сервис (образец "сырой Mongo" для e2e, но здесь
    // model уже под рукой, отдельный getModelToken не нужен).
    const raw = await model.findById(created.id).lean();
    expect(raw?.zoomLink).not.toBe('https://us02web.zoom.us/j/123');

    const found = await service.getById(created.id);
    expect(found.zoomLink).toBe('https://us02web.zoom.us/j/123');
  });

  it('create без channelIds — подставляются активные Telegram-каналы (фикс «занятие без каналов»)', async () => {
    const telegram = await channelModel.create({
      type: 'telegram',
      title: 'Группа учеников',
      config: '{}',
      target: '@group',
      active: true,
    });
    await channelModel.create({
      type: 'telegram',
      title: 'Выключенный',
      config: '{}',
      target: '@off',
      active: false,
    });
    await channelModel.create({
      type: 'vk',
      title: 'ВК школы',
      config: '{}',
      target: '777',
      active: true,
    });

    const created = await service.create({ title: 'Новое занятие', format: 'online' });

    expect(created.channelIds).toEqual([telegram._id.toString()]);
  });

  it('create без channelIds — личный канал ученика (broadcastEligible: false) не подставляется (ADR-0027)', async () => {
    const telegram = await channelModel.create({
      type: 'telegram',
      title: 'Группа учеников',
      config: '{}',
      target: '@group',
      active: true,
    });
    await channelModel.create({
      type: 'telegram',
      title: 'Личные сообщения: Ольга',
      config: '{}',
      target: '555',
      active: true,
      broadcastEligible: false,
    });

    const created = await service.create({ title: 'Новое занятие', format: 'online' });

    expect(created.channelIds).toEqual([telegram._id.toString()]);
  });

  it('create с явным channelIds: [] — остаётся пустым, активные каналы не подставляются', async () => {
    await channelModel.create({
      type: 'telegram',
      title: 'Группа учеников',
      config: '{}',
      target: '@group',
      active: true,
    });

    const created = await service.create({
      title: 'Занятие без рассылки',
      format: 'online',
      channelIds: [],
    });

    expect(created.channelIds).toEqual([]);
  });

  it('create с явным channelIds — список учителя не расширяется активными каналами', async () => {
    const chosen = await channelModel.create({
      type: 'telegram',
      title: 'Выбранный вручную',
      config: '{}',
      target: '@chosen',
      active: true,
    });
    await channelModel.create({
      type: 'telegram',
      title: 'Другой активный',
      config: '{}',
      target: '@other',
      active: true,
    });

    const created = await service.create({
      title: 'Занятие с выбором',
      format: 'online',
      channelIds: [chosen._id.toString()],
    });

    expect(created.channelIds).toEqual([chosen._id.toString()]);
  });

  it('update zoomPassword → getById видит новое значение', async () => {
    const created = await service.create({ title: 'Цигун', format: 'online' });

    await service.update(created.id, { zoomPassword: '2222' });

    const found = await service.getById(created.id);
    expect(found.zoomPassword).toBe('2222');
  });

  it('PATCH zoomPassword: null → поле исчезает из ответа (undefined, не null)', async () => {
    const created = await service.create({
      title: 'Цигун',
      format: 'online',
      zoomPassword: '1111',
    });

    const updated = await service.update(created.id, { zoomPassword: null });

    expect(updated.zoomPassword).toBeUndefined();
    expect(JSON.stringify(updated)).not.toContain('zoomPassword');
  });

  it('update с несуществующим id — NotFoundError', async () => {
    await expect(
      service.update('507f1f77bcf86cd799439011', { title: 'x' }),
    ).rejects.toThrow('Занятие не найдено');
  });

  it('list с active: false не возвращает активные', async () => {
    await service.create({ title: 'Активное', format: 'online', active: true });
    await service.create({ title: 'Выключенное', format: 'online', active: false });

    const list = await service.list({ active: false });

    expect(list.map((c) => c.title)).toEqual(['Выключенное']);
  });

  it('list: сортировка по алфавиту через collation, не по кодам символов', async () => {
    // Без collation Mongo сортирует по кодам: 'Я' (заглавная) идёт раньше
    // 'а' (строчная) — «Яблоко» оказалось бы перед «арбуз».
    await service.create({ title: 'Яблоко', format: 'online' });
    await service.create({ title: 'арбуз', format: 'online' });

    const list = await service.list({});

    expect(list.map((c) => c.title)).toEqual(['арбуз', 'Яблоко']);
  });

  it('list: лимит ограничивает количество результатов', async () => {
    await service.create({ title: 'А', format: 'online' });
    await service.create({ title: 'Б', format: 'online' });

    const list = await service.list({ limit: 1 });
    expect(list).toHaveLength(1);
  });

  it('remove: класс без занятий удаляется', async () => {
    const created = await service.create({ title: 'Без занятий', format: 'online' });

    await service.remove(created.id);

    await expect(service.getById(created.id)).rejects.toThrow('Занятие не найдено');
  });

  it('remove: класс с занятием — ConflictError, класс остаётся', async () => {
    const created = await service.create({ title: 'С занятием', format: 'online' });
    await lessonModel.create({
      classId: created.id,
      startsAt: new Date(),
      durationMin: 60,
    });

    await expect(service.remove(created.id)).rejects.toThrow('уже есть даты занятий');
    await expect(service.getById(created.id)).resolves.toMatchObject({
      title: 'С занятием',
    });
  });

  // Дыра, которая была до ADR-0056: класс без дат занятий удалялся, а
  // материалы школы продолжали ссылаться на пропавший id.
  it('remove: отвязывает удалённый класс от materials.classIds, материал остаётся', async () => {
    const created = await service.create({ title: 'Без занятий', format: 'online' });
    const material = await materialModel.create({
      title: 'Книга курса',
      url: 'https://example.com/book',
      kind: 'book',
      classIds: [created.id],
      lessonIds: [],
      access: 'all',
      createdBy: new Types.ObjectId(),
    });

    await service.remove(created.id);

    const afterRemove = await materialModel.findById(material._id).lean();
    expect(afterRemove).not.toBeNull();
    expect(afterRemove?.classIds).toEqual([]);
  });

  it('PATCH с тем же id правила — id сохраняется, поля обновляются', async () => {
    const created = await service.create({
      title: 'С правилом',
      format: 'online',
      rules: [{ weekday: 1, time: '19:00', durationMin: 60 }],
    });
    const [rule] = created.rules;
    if (!rule) throw new Error('правило не создалось');

    const updated = await service.update(created.id, {
      rules: [{ id: rule.id, weekday: 1, time: '20:00', durationMin: 60 }],
    });

    expect(updated.rules).toHaveLength(1);
    expect(updated.rules[0]?.id).toBe(rule.id);
    expect(updated.rules[0]?.time).toBe('20:00');
  });

  it('PATCH правил без id — прежнее правило заменяется, id новый', async () => {
    const created = await service.create({
      title: 'С правилом',
      format: 'online',
      rules: [{ weekday: 1, time: '19:00', durationMin: 60 }],
    });
    const [rule] = created.rules;
    if (!rule) throw new Error('правило не создалось');

    const updated = await service.update(created.id, {
      rules: [{ weekday: 2, time: '10:00', durationMin: 30 }],
    });

    expect(updated.rules).toHaveLength(1);
    expect(updated.rules[0]?.id).not.toBe(rule.id);
  });

  it('remove: несуществующий id — NotFoundError', async () => {
    await expect(service.remove('507f1f77bcf86cd799439011')).rejects.toThrow(
      'Занятие не найдено',
    );
  });

  describe('leaderId — проверка через assertTeacherExists (аудит В4)', () => {
    it('create с id учителя — leaderId в ответе', async () => {
      const teacher = await userModel.create({ name: 'Дмитрий', roles: ['teacher'] });

      const created = await service.create({
        title: 'С ведущим',
        format: 'online',
        leaderId: teacher._id.toString(),
      });

      expect(created.leaderId).toBe(teacher._id.toString());
    });

    it('create с id ученика — InvalidInputError, класс не создаётся', async () => {
      const student = await userModel.create({ name: 'Гриша', roles: [] });

      await expect(
        service.create({
          title: 'С неверным ведущим',
          format: 'online',
          leaderId: student._id.toString(),
        }),
      ).rejects.toThrow('не найден среди учителей');
      await expect(model.countDocuments({})).resolves.toBe(0);
    });

    it('update с id заблокированного учителя — InvalidInputError, класс не меняется', async () => {
      const created = await service.create({ title: 'Занятие', format: 'online' });
      const blocked = await userModel.create({
        name: 'Уволенный',
        roles: ['teacher'],
        status: 'blocked',
      });

      await expect(
        service.update(created.id, { leaderId: blocked._id.toString() }),
      ).rejects.toThrow('не найден среди учителей');
      await expect(service.getById(created.id)).resolves.toMatchObject({
        leaderId: undefined,
      });
    });

    it('update с leaderId: null — ведущий снимается без проверки', async () => {
      const teacher = await userModel.create({ name: 'Дмитрий', roles: ['teacher'] });
      const created = await service.create({
        title: 'Занятие',
        format: 'online',
        leaderId: teacher._id.toString(),
      });

      const updated = await service.update(created.id, { leaderId: null });

      expect(updated.leaderId).toBeUndefined();
    });
  });
});
