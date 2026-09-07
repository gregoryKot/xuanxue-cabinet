// Против настоящей Mongo (mongodb-memory-server, не мок ChannelConfigService
// — CLAUDE.md «Тесты»): фейковый ctx (не настоящий Telegraf Context —
// маршрутизацию проверяет telegram-bot.service.spec.ts), только те поля,
// которые читает хендлер. `oldStatus` в апдейтах — не декорация: хендлер
// реагирует на переход, не на голый new_chat_member.status (ADR-0015).
import type { Connection, Model } from 'mongoose';
import type { Context } from 'telegraf';
import type { ChatMemberUpdated } from 'telegraf/types';
import { ChannelConfigService } from '../../channels/channel-config.service';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import { ChatMemberHandler } from './chat-member.handler';

function fakeCtx(myChatMember: Partial<ChatMemberUpdated> | undefined): Context {
  return { myChatMember } as unknown as Context;
}

function memberUpdate(
  chatId: number,
  transition: { old: string; new: string },
  chatType: 'group' | 'private' = 'group',
): Partial<ChatMemberUpdated> {
  return {
    chat: { id: chatId, type: chatType, title: 'Ученики' } as never,
    old_chat_member: { status: transition.old } as never,
    new_chat_member: { status: transition.new } as never,
  };
}

describe('ChatMemberHandler', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let channelModel: Model<ChannelRecord>;
  let classModel: Model<ClassRecord>;
  let handler: ChatMemberHandler;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    await channelModel.syncIndexes();
    handler = new ChatMemberHandler(new ChannelConfigService(channelModel, classModel));
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await channelModel.deleteMany({});
    await classModel.deleteMany({});
  });

  it('новый чат (left → member) — канал создан и подключён ко всем активным классам', async () => {
    const activeClass = await classModel.create({
      title: 'Тайцзицюань',
      format: 'online',
      active: true,
    });

    await handler.handle(
      fakeCtx(memberUpdate(-100200300, { old: 'left', new: 'member' })),
    );

    const channel = await channelModel.findOne({ target: '-100200300' }).lean();
    expect(channel?.active).toBe(true);
    const cls = await classModel.findById(activeClass._id).lean();
    expect(cls?.channelIds.map(String)).toContain(String(channel?._id));
  });

  it('повышение в админы (member → administrator) — ничего не создаёт и не трогает', async () => {
    await handler.handle(
      fakeCtx(memberUpdate(-100111, { old: 'member', new: 'administrator' })),
    );

    expect(await channelModel.countDocuments({})).toBe(0);
  });

  it('понижение (administrator → member) — тоже игнорируется', async () => {
    await handler.handle(
      fakeCtx(memberUpdate(-100112, { old: 'administrator', new: 'member' })),
    );

    expect(await channelModel.countDocuments({})).toBe(0);
  });

  it('повторное добавление бота (kicked → member) — active без переподключения к новым активным классам', async () => {
    await handler.handle(fakeCtx(memberUpdate(-100222, { old: 'left', new: 'member' })));
    await handler.handle(
      fakeCtx(memberUpdate(-100222, { old: 'member', new: 'kicked' })),
    );
    const appeared = await classModel.create({
      title: 'Появился, пока бот был кикнут',
      format: 'online',
      active: true,
    });

    await handler.handle(
      fakeCtx(memberUpdate(-100222, { old: 'kicked', new: 'member' })),
    );

    const channel = await channelModel.findOne({ target: '-100222' }).lean();
    expect(channel?.active).toBe(true);
    const cls = await classModel.findById(appeared._id).lean();
    expect(cls?.channelIds).toHaveLength(0);
  });

  it('убрали бота (member → kicked) — канал active: false, документ не удаляется', async () => {
    await handler.handle(fakeCtx(memberUpdate(-100333, { old: 'left', new: 'member' })));

    await handler.handle(
      fakeCtx(memberUpdate(-100333, { old: 'member', new: 'kicked' })),
    );

    const channel = await channelModel.findOne({ target: '-100333' }).lean();
    expect(channel).not.toBeNull();
    expect(channel?.active).toBe(false);
  });

  it('left в приватном чате — игнорируется (не канал группы)', async () => {
    await handler.handle(
      fakeCtx(memberUpdate(555, { old: 'member', new: 'kicked' }, 'private')),
    );
    expect(await channelModel.countDocuments({})).toBe(0);
  });

  it('апдейт без my_chat_member — ничего не делает, не падает', async () => {
    await expect(handler.handle(fakeCtx(undefined))).resolves.toBeUndefined();
  });

  it('переход в restricted — не про членство бота, игнорируется', async () => {
    await handler.handle(
      fakeCtx(memberUpdate(-100555, { old: 'member', new: 'restricted' })),
    );
    expect(await channelModel.countDocuments({})).toBe(0);
  });

  it('ошибка ChannelConfigService — логируется, не выбрасывается', async () => {
    const failingConfig = {
      upsertTelegramChat: jest.fn().mockRejectedValue(new Error('mongo down')),
      deactivateTelegramChat: jest.fn(),
    } as unknown as ChannelConfigService;
    const failingHandler = new ChatMemberHandler(failingConfig);

    await expect(
      failingHandler.handle(
        fakeCtx(memberUpdate(-100444, { old: 'left', new: 'member' })),
      ),
    ).resolves.toBeUndefined();
  });
});
