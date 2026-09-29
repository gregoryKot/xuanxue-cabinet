// Против настоящей Mongo (CLAUDE.md «Тесты»): PATCH подобъекта
// `paymentReminder` точечными `$set` и чтение на «старой» базе, где подобъекта
// нет или он заполнен частично (ADR-0051). Проверка плейсхолдеров и маппер —
// settings-payment-reminder.spec.ts.
import type { Connection, Model } from 'mongoose';
import { DEFAULT_PAYMENT_REMINDER, DEFAULT_TEMPLATES } from '@xuanxue/shared';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { InvalidInputError } from '../common/errors';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { SettingsRecord, SettingsSchema } from './settings.schema';
import { SettingsService } from './settings.service';

describe('SettingsService — paymentReminder', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<SettingsRecord>;
  let service: SettingsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<SettingsRecord>(SettingsRecord.name, SettingsSchema);
    const lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    const classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    const userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    service = new SettingsService(
      model,
      lessonModel,
      classModel,
      new UsersService(userModel),
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('новая база — напоминание выключено, остальное по умолчанию', async () => {
    const settings = await service.get();

    expect(settings.paymentReminder).toEqual(DEFAULT_PAYMENT_REMINDER);
  });

  it('старая база без подобъекта — дефолт, не undefined', async () => {
    await model.create({
      _id: 'school',
      templates: { lessonLink: DEFAULT_TEMPLATES.lesson_link, recording: 'x' },
      tz: 'Asia/Jerusalem',
    });

    const settings = await service.get();

    expect(settings.paymentReminder).toEqual(DEFAULT_PAYMENT_REMINDER);
  });

  it('старая база: PATCH одного поля создаёт подобъект, остальные — дефолтом', async () => {
    await model.create({
      _id: 'school',
      templates: { lessonLink: DEFAULT_TEMPLATES.lesson_link, recording: 'x' },
      tz: 'Asia/Jerusalem',
    });

    const patched = await service.update({ paymentReminder: { enabled: true } });
    const got = await service.get();

    expect(patched.paymentReminder).toEqual({
      ...DEFAULT_PAYMENT_REMINDER,
      enabled: true,
    });
    expect(got.paymentReminder).toEqual(patched.paymentReminder);
  });

  it('второй PATCH другого поля не затирает первое (точечные пути)', async () => {
    await service.update({ paymentReminder: { dayOfMonth: 31 } });

    const patched = await service.update({ paymentReminder: { time: '09:30' } });

    expect(patched.paymentReminder).toEqual({
      ...DEFAULT_PAYMENT_REMINDER,
      dayOfMonth: 31,
      time: '09:30',
    });
  });

  it('текст напоминания сохраняется как есть, включая переводы строк по краям', async () => {
    const template = '\n{имя}, оплата за {месяц}[ {ссылка}]\n';

    const patched = await service.update({ paymentReminder: { template } });

    expect(patched.paymentReminder.template).toBe(template);
  });

  it('paymentReminder: {} — не трогает базу, updatedAt не двигается', async () => {
    const before = await service.get();

    const result = await service.update({ paymentReminder: {} });

    expect(result).toEqual(before);
  });

  it('неизвестная подстановка — InvalidInputError, ничего не сохраняется', async () => {
    await expect(
      service.update({ paymentReminder: { enabled: true, template: '{название}' } }),
    ).rejects.toThrow(InvalidInputError);

    const got = await service.get();
    expect(got.paymentReminder).toEqual(DEFAULT_PAYMENT_REMINDER);
  });
});
