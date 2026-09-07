// Против настоящей Mongo (CLAUDE.md «Тесты») — условный апдейт previewSentAt
// ДО отправки, окно PREVIEW_MINUTES, кнопки; TeacherChats/TelegramBotService —
// фейки (сеть проверяют их собственные спеки).
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import { encryptSchemaFrom } from '../common/field-policy';
import { encryptRecord } from '../utils/encryption';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
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
  return { list: jest.fn().mockResolvedValue(chats) };
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

  it('в окне PREVIEW_MINUTES — шлёт каждому учителю, ставит previewSentAt', async () => {
    const broadcast = await createBroadcast();
    const bot = fakeBot();
    const teacherChats = fakeTeacherChats();
    const service = new PreviewService(
      broadcastModel,
      teacherChats as never,
      bot as unknown as TelegramBotService,
    );

    const result = await service.sendPending(NOW);

    expect(result).toEqual({ sent: 1 });
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
    );

    const result = await service.sendPending(NOW);

    expect(result).toEqual({ sent: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('scheduledAt дальше PREVIEW_MINUTES — ещё рано', async () => {
    await createBroadcast({ scheduledAt: NOW.plus({ minutes: 10 }).toJSDate() });
    const bot = fakeBot();
    const service = new PreviewService(
      broadcastModel,
      fakeTeacherChats() as never,
      bot as unknown as TelegramBotService,
    );

    const result = await service.sendPending(NOW);

    expect(result).toEqual({ sent: 0 });
  });

  it('рассылка уже не scheduled (раннер успел раньше) — предпросмотр не шлёт', async () => {
    await createBroadcast({ status: 'sent' });
    const bot = fakeBot();
    const service = new PreviewService(
      broadcastModel,
      fakeTeacherChats() as never,
      bot as unknown as TelegramBotService,
    );

    const result = await service.sendPending(NOW);

    expect(result).toEqual({ sent: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('previewSentAt заняли между выборкой и захватом (гонка) — вторая попытка пропускает', async () => {
    const broadcast = await createBroadcast();
    // Симулируем гонку: пока sendPending() строит список due, previewSentAt
    // уже поставлен другим инстансом — claim() внутри должен вернуть false.
    await broadcastModel.updateOne(
      { _id: broadcast._id },
      { $set: { previewSentAt: NOW.toJSDate() } },
    );
    const bot = fakeBot();
    const service = new PreviewService(
      broadcastModel,
      fakeTeacherChats() as never,
      bot as unknown as TelegramBotService,
    );
    // find() внутри sendPending фильтрует по previewSentAt: {$exists:false} —
    // документ уже не попадёт в due, поэтому claim()==false проверяем напрямую.
    const claim = (
      service as unknown as { claim(id: unknown, now: DateTime): Promise<boolean> }
    ).claim.bind(service);

    await expect(claim(broadcast._id, NOW)).resolves.toBe(false);
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
    );

    const result = await service.sendPending(NOW);

    expect(result).toEqual({ sent: 1 });
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
    );

    const result = await service.sendPending(NOW);

    expect(result).toEqual({ sent: 1 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
    const updated = await broadcastModel.findById(broadcast._id).lean();
    expect(updated?.previewSentAt).toBeInstanceOf(Date);
  });
});
