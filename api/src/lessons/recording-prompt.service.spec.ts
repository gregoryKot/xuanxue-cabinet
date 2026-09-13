// Против настоящей Mongo (CLAUDE.md «Тесты») — условный апдейт
// recordingPromptedAt ДО отправки, окно «занятие закончилось», ожидание
// записи заводится каждому чату; PersonalChats/TelegramBotService — фейки.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import type { PersonalChat } from '../telegram/personal-chats';
import { BotSessionRecord, BotSessionSchema } from '../telegram/bot-session.schema';
import { BotSessionService } from '../telegram/bot-session.service';
import type { TelegramBotService } from '../telegram/telegram-bot.service';
import { LessonRecord, LessonSchema } from './lesson.schema';
import { RecordingPromptService } from './recording-prompt.service';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const CHAT: PersonalChat = { chatId: '111', userId: 'u1', name: 'Мария' };

function fakePersonalChats(chats: PersonalChat[] = [CHAT]) {
  return { listFor: jest.fn().mockResolvedValue(chats) };
}

function fakeBot(): {
  sendMessage: jest.Mock<Promise<void>, [string, string, unknown[][]?]>;
} {
  return {
    sendMessage: jest
      .fn<Promise<void>, [string, string, unknown[][]?]>()
      .mockResolvedValue(undefined),
  };
}

describe('RecordingPromptService.prompt', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;
  let botSessionModel: Model<BotSessionRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    botSessionModel = connection.model<BotSessionRecord>(
      BotSessionRecord.name,
      BotSessionSchema,
    );
    await botSessionModel.syncIndexes();
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      lessonModel.deleteMany({}),
      classModel.deleteMany({}),
      botSessionModel.deleteMany({}),
    ]);
  });

  async function createClass(overrides: Partial<ClassRecord> = {}) {
    return classModel.create({
      title: 'цигун для глаз',
      groupLabel: '',
      format: 'online',
      tz: 'Asia/Jerusalem',
      leadMinutes: 30,
      active: true,
      channelIds: [],
      ...overrides,
    });
  }

  function build(personalChats = fakePersonalChats(), bot = fakeBot()) {
    const service = new RecordingPromptService(
      lessonModel,
      classModel,
      personalChats as never,
      new BotSessionService(botSessionModel),
      bot as unknown as TelegramBotService,
    );
    return { service, bot };
  }

  it('занятие закончилось — спрашивает, ставит recordingPromptedAt, заводит ожидание', async () => {
    const cls = await createClass();
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.minus({ hours: 1, minutes: 5 }).toJSDate(),
      durationMin: 60,
      topic: 'цигун',
      status: 'scheduled',
    });
    const { service, bot } = build();

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 1 });
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text] = bot.sendMessage.mock.calls[0] as [string, string];
    expect(chatId).toBe('111');
    expect(text).toContain('цигун для глаз');
    const updated = await lessonModel.findById(lesson._id).lean();
    expect(updated?.recordingPromptedAt).toBeInstanceOf(Date);
    const session = await botSessionModel.findOne({ chatId: 111 }).lean();
    expect(session?.kind).toBe('recording');
    expect(session?.lessonId?.toString()).toBe(lesson._id.toString());
  });

  it('DST Asia/Jerusalem: конец занятия — по UTC-разнице, не по локальной стрелке', async () => {
    // Израиль переводит стрелки на летнее время в ночь на 2026-03-27 (02:00
    // IST → 03:00 IDT, тот же переход, что в lesson-planner.service.spec.ts).
    // Занятие длиной 3 часа стартует прямо перед переходом — если бы конец
    // считался наивно через локальное время, а не через now/startsAt в UTC
    // (CLAUDE.md «Время»), «закончилось» сдвинулось бы на час.
    const cls = await createClass();
    await lessonModel.create({
      classId: cls._id,
      startsAt: DateTime.fromISO('2026-03-26T22:00:00Z', { zone: 'utc' }).toJSDate(),
      durationMin: 180,
      topic: 'цигун',
      status: 'scheduled',
    });
    const beforeEnd = build();
    const stillGoing = await beforeEnd.service.prompt(
      DateTime.fromISO('2026-03-27T00:59:00Z', { zone: 'utc' }),
    );
    expect(stillGoing).toEqual({ prompted: 0 });

    const afterEnd = build();
    const ended = await afterEnd.service.prompt(
      DateTime.fromISO('2026-03-27T01:01:00Z', { zone: 'utc' }),
    );
    expect(ended).toEqual({ prompted: 1 });
  });

  it('занятие ещё идёт — не спрашивает', async () => {
    const cls = await createClass();
    await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.minus({ minutes: 10 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
    });
    const { service, bot } = build();

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('recordingPromptedAt уже стоит — повторно не спрашивает', async () => {
    const cls = await createClass();
    await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.minus({ hours: 2 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
      recordingPromptedAt: NOW.minus({ minutes: 30 }).toJSDate(),
    });
    const { service, bot } = build();

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('класс выключен — не спрашивает', async () => {
    const cls = await createClass({ active: false });
    await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.minus({ hours: 1, minutes: 5 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
    });
    const { service, bot } = build();

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('занятие отменено (status не scheduled) — не спрашивает', async () => {
    const cls = await createClass();
    await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.minus({ hours: 1, minutes: 5 }).toJSDate(),
      durationMin: 60,
      status: 'cancelled',
    });
    const { service, bot } = build();

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('ни одного учителя не подключено — не спрашивает и не ставит recordingPromptedAt (иначе тик подключения теряет вопрос навсегда)', async () => {
    const cls = await createClass();
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.minus({ hours: 1, minutes: 5 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
    });
    const { service, bot } = build(fakePersonalChats([]));

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
    const updated = await lessonModel.findById(lesson._id).lean();
    expect(updated?.recordingPromptedAt).toBeUndefined();
  });

  it('спрашивает PersonalChats именно про recording_request, не другой вид', async () => {
    const cls = await createClass();
    await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.minus({ hours: 1, minutes: 5 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
    });
    const personalChats = fakePersonalChats();
    const { service } = build(personalChats);

    await service.prompt(NOW);

    expect(personalChats.listFor).toHaveBeenCalledWith('recording_request', NOW);
  });

  it('занятие ровно на границе LOOKBACK_DAYS (7 дней назад) — ещё спрашивает', async () => {
    const cls = await createClass();
    await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.minus({ days: 7 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
    });
    const { service, bot } = build();

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 1 });
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('занятие старше LOOKBACK_DAYS (7 дней и минута) — уже не спрашивает', async () => {
    const cls = await createClass();
    await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.minus({ days: 7, minutes: 1 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
    });
    const { service, bot } = build();

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('гонка двух тиков на одном занятии — сообщение уходит один раз, prompted суммарно 1', async () => {
    const cls = await createClass();
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.minus({ hours: 1, minutes: 5 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
    });
    const bot = fakeBot();
    const personalChats = fakePersonalChats();
    const serviceA = new RecordingPromptService(
      lessonModel,
      classModel,
      personalChats as never,
      new BotSessionService(botSessionModel),
      bot as unknown as TelegramBotService,
    );
    const serviceB = new RecordingPromptService(
      lessonModel,
      classModel,
      personalChats as never,
      new BotSessionService(botSessionModel),
      bot as unknown as TelegramBotService,
    );

    const [resultA, resultB] = await Promise.all([
      serviceA.prompt(NOW),
      serviceB.prompt(NOW),
    ]);

    expect(resultA.prompted + resultB.prompted).toBe(1);
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    const updated = await lessonModel.findById(lesson._id).lean();
    expect(updated?.recordingPromptedAt).toBeInstanceOf(Date);
  });
});
