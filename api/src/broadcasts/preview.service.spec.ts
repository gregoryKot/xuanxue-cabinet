// Против настоящей Mongo (CLAUDE.md «Тесты») — условный апдейт previewSentAt
// ДО отправки, окно settings.previewMinutes, кнопки; TeacherChats/
// TelegramBotService/SettingsService — фейки (сеть/база проверяют
// собственные спеки, settings.service.spec.ts).
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import { DEFAULT_PREVIEW_MINUTES } from '@xuanxue/shared';
import { claimOnce } from '../common/claim-once';
import { encryptSchemaFrom } from '../common/field-policy';
import { encryptRecord } from '../utils/encryption';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import type { SettingsService } from '../settings/settings.service';
import type { TeacherChat } from '../telegram/teacher-chats';
import type { TelegramBotService } from '../telegram/telegram-bot.service';
import {
  BROADCAST_FIELD_POLICY,
  BroadcastRecord,
  BroadcastSchema,
} from './broadcast.schema';
import { PreviewService } from './preview.service';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const ENCRYPT_SCHEMA = encryptSchemaFrom(BROADCAST_FIELD_POLICY);
const CHAT: TeacherChat = { chatId: '111', userId: 'u1', name: 'Мария' };

function fakeTeacherChats(chats: TeacherChat[] = [CHAT]) {
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

// previewMinutes — настройка школы (SettingsService.get()), не константа:
// фейк с get(), не реальный сервис с Mongo (CLAUDE.md «Тесты» — юнит без
// лишней зависимости там, где чистой логики достаточно).
function fakeSettings(previewMinutes = DEFAULT_PREVIEW_MINUTES): SettingsService {
  return {
    get: jest.fn().mockResolvedValue({ previewMinutes }),
  } as unknown as SettingsService;
}

describe('PreviewService.sendPending', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let broadcastModel: Model<BroadcastRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    broadcastModel = connection.model<BroadcastRecord>(
      BroadcastRecord.name,
      BroadcastSchema,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await broadcastModel.deleteMany({});
  });

  async function createBroadcast(overrides: Partial<BroadcastRecord> = {}) {
    return broadcastModel.create(
      encryptRecord(
        {
          kind: 'lesson_link',
          channelIds: [],
          scheduledAt: NOW.plus({ minutes: 3 }).toJSDate(),
          text: 'через 3 минуты занятие https://zoom.example/1',
          status: 'scheduled',
          ...overrides,
        },
        ENCRYPT_SCHEMA,
      ),
    );
  }

  it('в окне settings.previewMinutes (дефолт) — шлёт каждому учителю, ставит previewSentAt', async () => {
    const broadcast = await createBroadcast();
    const bot = fakeBot();
    const teacherChats = fakeTeacherChats();
    const service = new PreviewService(
      broadcastModel,
      teacherChats as never,
      bot as unknown as TelegramBotService,
      fakeSettings(),
    );

    const result = await service.sendPending(NOW);

    expect(result).toEqual({ claimed: 1 });
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text, buttons] = bot.sendMessage.mock.calls[0] as [
      string,
      string,
      unknown,
    ];
    expect(chatId).toBe('111');
    expect(text).toContain('https://zoom.example/1');
    expect(buttons).toEqual([
      [{ text: 'Отменить', callback_data: `cancel:${broadcast._id.toString()}` }],
    ]);

    const updated = await broadcastModel.findById(broadcast._id).lean();
    expect(updated?.previewSentAt).toBeInstanceOf(Date);
  });

  it('с lessonId — кнопка «Изменить тему» тоже есть', async () => {
    const lessonId = new Types.ObjectId();
    await createBroadcast({ lessonId });
    const bot = fakeBot();
    const service = new PreviewService(
      broadcastModel,
      fakeTeacherChats() as never,
      bot as unknown as TelegramBotService,
      fakeSettings(),
    );

    await service.sendPending(NOW);

    const buttons = bot.sendMessage.mock.calls[0]?.[2] as unknown[];
    expect(buttons[0]).toHaveLength(2);
  });

  it('previewSentAt уже стоит — повторно не шлёт', async () => {
    await createBroadcast({ previewSentAt: NOW.minus({ minutes: 1 }).toJSDate() });
    const bot = fakeBot();
    const service = new PreviewService(
      broadcastModel,
      fakeTeacherChats() as never,
      bot as unknown as TelegramBotService,
      fakeSettings(),
    );

    const result = await service.sendPending(NOW);

    expect(result).toEqual({ claimed: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('scheduledAt дальше settings.previewMinutes (дефолт) — ещё рано', async () => {
    await createBroadcast({ scheduledAt: NOW.plus({ minutes: 10 }).toJSDate() });
    const bot = fakeBot();
    const service = new PreviewService(
      broadcastModel,
      fakeTeacherChats() as never,
      bot as unknown as TelegramBotService,
      fakeSettings(),
    );

    const result = await service.sendPending(NOW);

    expect(result).toEqual({ claimed: 0 });
  });

  // ТЗ preview-minutes.md: значение из настроек реально меняет окно
  // «пора показывать», не только дефолт — то же scheduledAt, что «ещё рано»
  // выше с previewMinutes=5, становится «пора» с previewMinutes=10.
  it('previewMinutes из настроек шире дефолта — раньше входит в окно', async () => {
    const broadcast = await createBroadcast({
      scheduledAt: NOW.plus({ minutes: 8 }).toJSDate(),
    });
    const bot = fakeBot();
    const service = new PreviewService(
      broadcastModel,
      fakeTeacherChats() as never,
      bot as unknown as TelegramBotService,
      fakeSettings(10),
    );

    const result = await service.sendPending(NOW);

    expect(result).toEqual({ claimed: 1 });
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    const updated = await broadcastModel.findById(broadcast._id).lean();
    expect(updated?.previewSentAt).toBeInstanceOf(Date);
  });

  it('scheduledAt в прошлом (догоняющий тик / легаси scheduled) — предпросмотр не шлём', async () => {
    await createBroadcast({ scheduledAt: NOW.minus({ minutes: 1 }).toJSDate() });
    const bot = fakeBot();
    const service = new PreviewService(
      broadcastModel,
      fakeTeacherChats() as never,
      bot as unknown as TelegramBotService,
      fakeSettings(),
    );

    const result = await service.sendPending(NOW);

    expect(result).toEqual({ claimed: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('несколько due рассылок — teacherChats.listFor зовётся один раз на весь тик', async () => {
    await createBroadcast();
    await createBroadcast();
    const bot = fakeBot();
    const teacherChats = fakeTeacherChats();
    const service = new PreviewService(
      broadcastModel,
      teacherChats as never,
      bot as unknown as TelegramBotService,
      fakeSettings(),
    );

    const result = await service.sendPending(NOW);

    expect(result).toEqual({ claimed: 2 });
    expect(teacherChats.listFor).toHaveBeenCalledTimes(1);
  });

  it('спрашивает TeacherChats именно про post_draft, не другой вид', async () => {
    await createBroadcast();
    const bot = fakeBot();
    const teacherChats = fakeTeacherChats();
    const service = new PreviewService(
      broadcastModel,
      teacherChats as never,
      bot as unknown as TelegramBotService,
      fakeSettings(),
    );

    await service.sendPending(NOW);

    expect(teacherChats.listFor).toHaveBeenCalledWith('post_draft', NOW);
  });

  it('рассылка уже не scheduled (раннер успел раньше) — предпросмотр не шлёт', async () => {
    await createBroadcast({ status: 'sent' });
    const bot = fakeBot();
    const service = new PreviewService(
      broadcastModel,
      fakeTeacherChats() as never,
      bot as unknown as TelegramBotService,
      fakeSettings(),
    );

    const result = await service.sendPending(NOW);

    expect(result).toEqual({ claimed: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('previewSentAt заняли между выборкой и захватом (гонка) — вторая попытка пропускает', async () => {
    const broadcast = await createBroadcast();
    // Симулируем гонку: пока sendPending() строит список due, previewSentAt
    // уже поставлен другим инстансом — общий claimOnce (api/src/common/
    // claim-once.ts, тот же, что зовёт сам PreviewService) должен вернуть
    // false, не найдя документ без поля.
    await broadcastModel.updateOne(
      { _id: broadcast._id },
      { $set: { previewSentAt: NOW.toJSDate() } },
    );

    await expect(
      claimOnce(broadcastModel, broadcast._id, 'previewSentAt', NOW),
    ).resolves.toBe(false);
  });

  it('текст не расшифровался — не шлёт, previewSentAt всё равно ставится', async () => {
    // Пустой text не проходит required-валидацию Mongoose (create()) — пишем
    // документ напрямую через драйвер, как испорченный/легаси случай.
    const { insertedId } = await connection.collection('broadcasts').insertOne({
      kind: 'lesson_link',
      channelIds: [],
      scheduledAt: NOW.plus({ minutes: 3 }).toJSDate(),
      text: '',
      status: 'scheduled',
    });
    const broadcast = { _id: insertedId };
    const bot = fakeBot();
    const service = new PreviewService(
      broadcastModel,
      fakeTeacherChats() as never,
      bot as unknown as TelegramBotService,
      fakeSettings(),
    );

    const result = await service.sendPending(NOW);

    expect(result).toEqual({ claimed: 1 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
    const updated = await broadcastModel.findById(broadcast._id).lean();
    expect(updated?.previewSentAt).toBeInstanceOf(Date);
  });

  it('ни одного учителя не подключено — previewSentAt всё равно ставится (повтор не нужен)', async () => {
    const broadcast = await createBroadcast();
    const bot = fakeBot();
    const service = new PreviewService(
      broadcastModel,
      fakeTeacherChats([]) as never,
      bot as unknown as TelegramBotService,
      fakeSettings(),
    );

    const result = await service.sendPending(NOW);

    expect(result).toEqual({ claimed: 1 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
    const updated = await broadcastModel.findById(broadcast._id).lean();
    expect(updated?.previewSentAt).toBeInstanceOf(Date);
  });
});
