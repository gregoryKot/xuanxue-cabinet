// my_chat_member — статус бота в чате изменился (docs/PLAN.md §6, ADR-0015):
// добавили в группу/супергруппу/канал — чат сам становится каналом рассылки
// и подключается ко всем активным классам, ноль настройки руками. Личные
// чаты сюда не попадают (та же Telegram-нотификация для private — про
// блокировку бота пользователем), их обрабатывает start.handler.ts.
//
// Реагируем на ПЕРЕХОД, не на голый new_chat_member.status: апдейт
// приходит при любом изменении прав бота, включая повышение/понижение
// между member и administrator — такие переходы не значат «бота добавили
// или убрали» и должны быть проигнорированы (иначе повышение до админа
// повторно дёргало бы upsertTelegramChat без причины).
import { Injectable, Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import type { Chat } from 'telegraf/types';
import { ChannelConfigService } from '../../channels/channel-config.service';
import { errorMessage, errorStack } from '../../common/error-info';

type RegisterableChat = Chat.GroupChat | Chat.SupergroupChat | Chat.ChannelChat;

function isRegisterableChat(chat: Chat): chat is RegisterableChat {
  return chat.type === 'group' || chat.type === 'supergroup' || chat.type === 'channel';
}

const JOINED_STATUSES = new Set(['member', 'administrator']);
const OUT_STATUSES = new Set(['left', 'kicked']);

@Injectable()
export class ChatMemberHandler {
  private readonly logger = new Logger(ChatMemberHandler.name);

  constructor(private readonly channelConfig: ChannelConfigService) {}

  async handle(ctx: Context): Promise<void> {
    const update = ctx.myChatMember;
    if (!update || !isRegisterableChat(update.chat)) return;

    const chatId = String(update.chat.id);
    const wasOut = OUT_STATUSES.has(update.old_chat_member.status);
    const isJoined = JOINED_STATUSES.has(update.new_chat_member.status);
    const isOut = OUT_STATUSES.has(update.new_chat_member.status);

    try {
      // Бота добавили: не был в чате (или был кикнут) → теперь member/admin.
      if (wasOut && isJoined) {
        await this.channelConfig.upsertTelegramChat({ chatId, title: update.chat.title });
        return;
      }
      // Бота убрали: новый статус — left/kicked, независимо от старого.
      if (isOut) {
        await this.channelConfig.deactivateTelegramChat(chatId);
      }
      // Остальные переходы (member ↔ administrator) — не про канал, игнор.
    } catch (err) {
      this.logger.error(`telegram.my_chat_member: ${errorMessage(err)}`, errorStack(err));
    }
  }
}
