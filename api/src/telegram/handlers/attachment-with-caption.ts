// Отправка «вложение первым, подпись вторым» одному адресату — общая механика
// exam-media-forward.ts (видео экзамена, ADR-0023, копия сообщения ученика) и
// payment-screenshot-to-accountant.ts (снимок перевода, ADR-0050/0156: копия
// сообщения из бота или байты из кабинета): CLAUDE.md «Одна механика — один
// компонент», jscpd не должен видеть один и тот же код дважды. Откуда взялось
// вложение, знает вызывающий код — он передаёт `sendAttachment`. Подпись без
// вложения бессмысленна (video_note/«кружок» не поддерживает caption вовсе —
// единый приём для всех видов вложения проще, чем разбирать, что поддерживает
// caption у copyMessage, а что нет), поэтому подпись уходит вторым сообщением
// и только если первое дошло. Решение «пропали ли ВСЕ адресаты» (warn на
// одного или error на всех) остаётся у вызывающего кода — здесь только один
// получатель и один лог-лейбл.
//
// Оба вызова Bot API — с таймаутом (telegramCallOptions): на пути HTTP
// (загрузка из кабинета) молчащая сеть иначе держала бы ответ ученику до
// таймаута платформы.
import { Logger } from '@nestjs/common';
import type { Telegram } from 'telegraf';
import { telegramCallOptions } from '../../channels/telegram-client';
import { errorMessage } from '../../common/error-info';

const logger = new Logger('attachmentWithCaption');

/** Отправка самого вложения в чат адресата; сбой — исключением. */
export type AttachmentSender = (telegram: Telegram, chatId: string) => Promise<unknown>;

export interface AttachmentWithCaptionInput {
  telegram: Telegram;
  toChatId: string;
  sendAttachment: AttachmentSender;
  caption: string;
  logLabel: string;
}

/** Вложение — копия сообщения, которое ученик прислал боту (`copyMessage`). */
export function copyMessageSender(
  fromChatId: number,
  messageId: number,
): AttachmentSender {
  return (telegram, chatId) =>
    telegram.callApi(
      'copyMessage',
      { chat_id: chatId, from_chat_id: fromChatId, message_id: messageId },
      telegramCallOptions(),
    );
}

/** `true` — вложение дошло (подпись могла и не дойти, это не авария). */
export async function sendAttachmentWithCaption({
  telegram,
  toChatId,
  sendAttachment,
  caption,
  logLabel,
}: AttachmentWithCaptionInput): Promise<boolean> {
  try {
    await sendAttachment(telegram, toChatId);
  } catch (err) {
    logger.warn({ chatId: toChatId }, `${logLabel}.attachment: ${errorMessage(err)}`);
    return false; // без вложения подпись — сирота, не шлём вовсе
  }
  try {
    await telegram.callApi(
      'sendMessage',
      { chat_id: toChatId, text: caption },
      telegramCallOptions(),
    );
  } catch (err) {
    logger.warn({ chatId: toChatId }, `${logLabel}.caption: ${errorMessage(err)}`);
    // Вложение уже дошло — главное получено, подпись теряем без эскалации.
  }
  return true;
}
