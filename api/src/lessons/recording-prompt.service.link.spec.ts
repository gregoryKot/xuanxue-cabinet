// Против настоящей Mongo (CLAUDE.md «Тесты») — ветка «у занятия не было
// ссылки» шага «Запись?»: вопроса нет, но recordingPromptedAt и
// recordingDeclinedAt ставятся, чтобы занятие не занимало батч каждый тик и
// не попадало в «ещё жду запись» (владелец, 2026-10-06). Остальные сценарии
// сервиса — в recording-prompt.service.spec.ts.
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
const LATER = NOW.plus({ minutes: 10 });
const CHAT: PersonalChat = { chatId: '111', userId: 'u1', name: 'Мария' };

describe('RecordingPromptService.prompt: занятие без ссылки', () => {
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

  // Класс без zoomLink — в отличие от createClass основного спека.
  async function createClassWithoutLink() {
    return classModel.create({
      title: 'цигун для глаз',
      groupLabel: '',
      format: 'online',
      tz: 'Asia/Jerusalem',
      leadMinutes: 30,
      active: true,
      channelIds: [],
    });
  }

  function build() {
    const bot = {
      sendMessage: jest.fn<Promise<void>, [string, string, unknown[][]?]>(),
    };
    bot.sendMessage.mockResolvedValue(undefined);
    const service = new RecordingPromptService(
      lessonModel,
      classModel,
      { listFor: jest.fn().mockResolvedValue([CHAT]) } as never,
      new BotSessionService(botSessionModel),
      bot as unknown as TelegramBotService,
    );
    return { service, bot };
  }

  it('нет ссылки ни у класса, ни у занятия — не спрашивает, но ставит обе отметки', async () => {
    const cls = await createClassWithoutLink();
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.minus({ hours: 1, minutes: 5 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
    });
    const { service, bot } = build();

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
    const updated = await lessonModel.findById(lesson._id).lean();
    expect(updated?.recordingPromptedAt).toEqual(NOW.toJSDate());
    expect(updated?.recordingDeclinedAt).toEqual(NOW.toJSDate());
    expect(await botSessionModel.countDocuments({})).toBe(0);
  });

  it('у класса ссылки нет, но у занятия разовая — спрашивает как обычно', async () => {
    const cls = await createClassWithoutLink();
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.minus({ hours: 1, minutes: 5 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
      zoomLinkOverride: 'https://zoom.example/2',
    });
    const { service, bot } = build();

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 1 });
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    const updated = await lessonModel.findById(lesson._id).lean();
    expect(updated?.recordingPromptedAt).toBeInstanceOf(Date);
    expect(updated?.recordingDeclinedAt).toBeUndefined();
  });

  it('второй тик не трогает занятие без ссылки — отметка не перезаписывается, батч свободен', async () => {
    const cls = await createClassWithoutLink();
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.minus({ hours: 1, minutes: 5 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
    });
    const { service, bot } = build();
    await service.prompt(NOW);

    const result = await service.prompt(LATER);

    expect(result).toEqual({ prompted: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
    const updated = await lessonModel.findById(lesson._id).lean();
    // Отметки первого тика на месте: recordingPromptedAt уже стоит, значит
    // кандидатом второго тика занятие не стало.
    expect(updated?.recordingDeclinedAt).toEqual(NOW.toJSDate());
    expect(updated?.recordingPromptedAt).toEqual(NOW.toJSDate());
  });
});
