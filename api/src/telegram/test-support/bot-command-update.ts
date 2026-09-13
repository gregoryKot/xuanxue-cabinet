// Апдейт с латинской командой — отдельным файлом: bot-service.fixtures.ts
// упёрся в лимит 150 строк (CLAUDE.md «Храповики»).
import type { Update } from 'telegraf/types';

/** Латинская команда — с entity `bot_command`: Telegraf разбирает
 * `bot.command()` именно по entities, а не по тексту (кириллические `/тема` и
 * `/уведомления` ловит hears по тексту — у них entity не бывает). */
export function botCommandUpdate(text: string, updateId: number): Update {
  return {
    update_id: updateId,
    message: {
      message_id: 9,
      date: 0,
      chat: { id: 111, type: 'private', first_name: 'Дима' },
      from: { id: 111, is_bot: false, first_name: 'Дима' },
      text,
      entities: [
        { type: 'bot_command', offset: 0, length: text.split(' ')[0]?.length ?? 0 },
      ],
    },
  } as unknown as Update;
}
