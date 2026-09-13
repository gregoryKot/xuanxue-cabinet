// Автоподтверждение нового человека по участию в группе учеников в Telegram
// (ADR-0026, решение владельца 2026-09-12: «если человек участник группы, то
// можно»). Вызывается из TelegramAuthService только для нового пользователя,
// после проверки подписи виджета (SECURITY §2). Живёт в channels/, потому
// что прямой вызов Bot API разрешён eslint только здесь и в api/src/telegram.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelConfigService } from './channel-config.service';
import { scrubChannelSecrets } from './channel-secrets';
import {
  TELEGRAM_CALL_TIMEOUT_MS,
  TELEGRAM_CLIENT_FACTORY,
  withTelegramSignal,
  type TelegramApiClient,
  type TelegramClientFactory,
} from './telegram-client';

// getChatMember (Bot API): эти статусы значат «состоит в чате» —
// left/kicked не член. Источник — @telegraf/types/manage.d.ts (ChatMember).
const MEMBER_STATUSES = new Set(['creator', 'administrator', 'member', 'restricted']);
// Подтверждать можно только участием в группе или супергруппе: личный чат
// (например, личный канал учителя) — не группа учеников, а в публичный
// широковещательный канал может вступить кто угодно — это дыра в защите
// (SECURITY §1, угроза №1 — зум-бомбинг).
const GROUP_CHAT_TYPES = new Set(['group', 'supergroup']);

@Injectable()
export class GroupMembershipService {
  private readonly logger = new Logger(GroupMembershipService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly channelConfig: ChannelConfigService,
    @Inject(TELEGRAM_CLIENT_FACTORY)
    private readonly clientFactory: TelegramClientFactory,
  ) {}

  /** true — человек уже состоит в одной из групп учеников школы, подтверждать
   * вручную не нужно. Останавливается на первой найденной группе. */
  async isMemberOfSchoolGroup(telegramId: number): Promise<boolean> {
    const token = this.config.get<string>('BOT_TOKEN');
    if (!token) return false;
    const client = this.clientFactory(token);
    const chatIds = await this.channelConfig.listActiveTelegramChatIds();
    for (const chatId of chatIds) {
      // Последовательно, а не Promise.all: как только нашли группу — дальше
      // не опрашиваем (задание, экономим вызовы Bot API).
      if (await this.isMemberOfGroup(client, chatId, telegramId, token)) return true;
    }
    return false;
  }

  // Любая ошибка Bot API (сеть, «бот не в чате», таймаут) — не бросаем
  // наверх: вход не должен падать из-за Telegram, человек просто останется
  // ждать подтверждения школой (SECURITY §2, ADR-0026).
  private async isMemberOfGroup(
    client: TelegramApiClient,
    chatId: string,
    telegramId: number,
    token: string,
  ): Promise<boolean> {
    try {
      const chat = await client.callApi(
        'getChat',
        { chat_id: chatId },
        withTelegramSignal(AbortSignal.timeout(TELEGRAM_CALL_TIMEOUT_MS)),
      );
      if (!GROUP_CHAT_TYPES.has(chat.type)) return false;

      const member = await client.callApi(
        'getChatMember',
        { chat_id: chatId, user_id: telegramId },
        withTelegramSignal(AbortSignal.timeout(TELEGRAM_CALL_TIMEOUT_MS)),
      );
      return MEMBER_STATUSES.has(member.status);
    } catch (err) {
      // chatId — только полем объекта, не в тексте строки, чтобы
      // redact-paths.ts мог им управлять (SECURITY §1 п.2). Текст ошибки —
      // через scrub: Telegram может вернуть BOT_TOKEN в URL (SECURITY §5–6).
      // Telegram id проверяемого человека в лог не идёт вовсе.
      const raw = err instanceof Error ? err.message : 'неизвестная ошибка';
      this.logger.warn(
        { chatId },
        `Не удалось проверить участие в группе Telegram: ${scrubChannelSecrets(raw, { chatId }, token)}`,
      );
      return false;
    }
  }
}
