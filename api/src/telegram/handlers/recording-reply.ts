// Ответ (reply) на вопрос бота «Занятие … закончилось» — занятие берётся из
// кнопки «Записи не будет» того сообщения (`norec:<lessonId>` в
// inline-клавиатуре): Telegram отдаёт reply_to_message вместе с его
// клавиатурой, хранить message_id вопроса не нужно (ADR-0175). Так учитель
// шлёт записи трёх занятий, отвечая на каждое сообщение своей ссылкой, —
// подсказка «Ответьте на сообщение бота о закончившемся занятии» в
// message.handler.ts до этого ничего не делала. Чистая функция, юнит-тест
// без Telegram.
import { Types } from 'mongoose';
import type { Message } from 'telegraf/types';
import { parseCallbackData } from '../callback-data';

export function lessonIdFromRepliedPrompt(message: Message | undefined): string | null {
  if (!message || !('reply_to_message' in message)) return null;
  const replied = message.reply_to_message;
  if (!replied || !('reply_markup' in replied)) return null;
  for (const row of replied.reply_markup?.inline_keyboard ?? []) {
    for (const button of row) {
      if (!('callback_data' in button)) continue;
      const parsed = parseCallbackData(button.callback_data);
      if (parsed?.action === 'norec' && Types.ObjectId.isValid(parsed.id))
        return parsed.id;
    }
  }
  return null;
}
