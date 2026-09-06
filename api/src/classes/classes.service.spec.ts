// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): шифрование секретов и read-after-write, PATCH null → $unset,
// запрет удаления класса с занятиями (clarification 7 ТЗ PR D).
import type { Connection, Model } from 'mongoose';
import { ClassRecord, ClassSchema } from './class.schema';
import { ClassesService } from './classes.service';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('ClassesService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<ClassRecord>;
  let lessonModel: Model<LessonRecord>;
  let service: ClassesService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    service = new ClassesService(model, lessonModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
    await lessonModel.deleteMany({});
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

    await expect(service.remove(created.id)).rejects.toThrow(
      'уже есть даты в расписании',
    );
    await expect(service.getById(created.id)).resolves.toMatchObject({
      title: 'С занятием',
    });
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
});
