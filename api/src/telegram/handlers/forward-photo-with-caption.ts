// Пересылка «вложение первым, подпись вторым» одному адресату — общая
// механика exam-media-forward.ts (видео экзамена, ADR-0023) и
// payment-screenshot-forward.ts (скриншот оплаты, ADR-0050): CLAUDE.md
// «Одна механика — один компонент», jscpd не должен видеть один и тот же
// код дважды. Подпись без вложения бессмысленна (video_note/«кружок» не
// поддерживает caption вовсе — единый приём для всех видов вложения проще,
// чем разбирать, что поддерживает caption у copyMessage, а что нет), поэтому
// подпись уходит вторым сообщением и только если первое дошло. Решение
// «пропали ли ВСЕ адресаты» (warn на одного или error на всех) остаётся у
// вызывающего кода — здесь только один получатель и один лог-лейбл.
import { Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import { errorMessage } from '../../common/error-info';

const logger = new Logger('forwardPhotoWithCaption');

/** `true` — вложение дошло (подпись могла и не дойти, это не авария). */
export async function forwardPhotoWithCaption(
  ctx: Context,
  toChatId: string,
  fromChatId: number,
  messageId: number,
  caption: string,
  logLabel: string,
): Promise<boolean> {
  try {
    await ctx.telegram.copyMessage(toChatId, fromChatId, messageId);
  } catch (err) {
    logger.warn({ chatId: toChatId }, `${logLabel}.photo: ${errorMessage(err)}`);
    return false; // без вложения подпись — сирота, не шлём вовсе
  }
  try {
    await ctx.telegram.sendMessage(toChatId, caption);
  } catch (err) {
    logger.warn({ chatId: toChatId }, `${logLabel}.caption: ${errorMessage(err)}`);
    // Вложение уже дошло — главное получено, подпись теряем без эскалации.
  }
  return true;
}
