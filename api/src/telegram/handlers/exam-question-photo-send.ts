// Отправка одной картинки вопроса-варианта (ADR-0118, ADR-0035, файл-лимит
// CLAUDE.md увёл это из exam-question-album-send.ts — там же остался только
// перебор общего списка, видео и ссылки — в exam-question-video-send.ts,
// тот же образец) — bytes/file_id через ExamBotPort, кэш file_id, деградация
// без исключения: сбой одной картинки не отменяет остальные (решает
// вызывающий код).
import { Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import type { InputFile, Message } from 'telegraf/types';
import type { ExamImageContentType } from '@xuanxue/shared';
import { errorMessage } from '../../common/error-info';
import type { UserLean } from '../../users/users.service';
import type { BotOptionImage, ExamBotPort } from '../exam-bot.port';
import type { ImageAlbumEntry } from './exam-question-album';

const logger = new Logger('examOptionPhoto');

// Экспорт — для файла снимка перевода, уходящего бухгалтеру (telegram-payment-screenshot-delivery.ts).
export const CONTENT_TYPE_EXTENSION: Record<ExamImageContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface ResolvedOption {
  entry: ImageAlbumEntry;
  image: BotOptionImage;
}

/** Картинка могла исчезнуть между снимком и показом (сирота-уборщик,
 * ADR-0035) или оказаться не своей — пропускаем это фото, а не весь вопрос. */
export async function resolveImages(
  examBot: ExamBotPort,
  user: UserLean,
  album: ImageAlbumEntry[],
): Promise<ResolvedOption[]> {
  const images = await Promise.all(
    album.map((entry) => examBot.loadOptionImage(entry.imageId, user)),
  );
  return album.flatMap((entry, i) => {
    const image = images[i];
    return image ? [{ entry, image }] : [];
  });
}

function toInputFile(entry: ImageAlbumEntry, image: BotOptionImage): InputFile {
  const ext = CONTENT_TYPE_EXTENSION[image.contentType];
  return { source: image.bytes, filename: `variant-${entry.optionIndex + 1}.${ext}` };
}

// SECURITY §1: attemptId/imageId — полями объекта, не в тексте строки.
function warnPhotoFailed(attemptId: string, entry: ImageAlbumEntry, err: unknown): void {
  logger.warn(`telegram.examOptionAlbum: ${errorMessage(err)}`, {
    attemptId,
    imageId: entry.imageId,
  });
}

/** file_id, которым Telegram отказался слать (например, сменили бота), —
 * второй и последний раз пробуем байтами. Без кэша ретраить нечем — обычный
 * сбой одной картинки не отменяет остальные (вызывающий код продолжает цикл). */
export async function sendOnePhoto(
  ctx: Context,
  chatId: number,
  resolved: ResolvedOption,
  attemptId: string,
): Promise<{ sent: Message.PhotoMessage; sentWithBytes: boolean } | null> {
  const { entry, image } = resolved;
  const hadCachedFileId = Boolean(image.telegramFileId);
  try {
    const media = hadCachedFileId
      ? (image.telegramFileId as string)
      : toInputFile(entry, image);
    const sent = await ctx.telegram.sendPhoto(chatId, media, { caption: entry.caption });
    return { sent, sentWithBytes: !hadCachedFileId };
  } catch (err) {
    if (!hadCachedFileId) {
      warnPhotoFailed(attemptId, entry, err);
      return null;
    }
  }
  try {
    const sent = await ctx.telegram.sendPhoto(chatId, toInputFile(entry, image), {
      caption: entry.caption,
    });
    return { sent, sentWithBytes: true };
  } catch (retryErr) {
    warnPhotoFailed(attemptId, entry, retryErr);
    return null;
  }
}

/** Только для того, что реально ушло байтами: если file_id уже знали и
 * отправка им удалась, Telegram просто пересылает тот же файл — писать в базу
 * то же самое значение незачем. Запоминаем сразу после отправки СВОЕЙ
 * картинки, 1:1 — раньше `sent` фильтровался (`filter(m => 'photo' in m)`), а
 * сопоставление `resolved[i]` ↔ `sent[i]` по индексу после фильтра могло
 * закэшировать file_id не той картинке (баг, из-за которого чужое фото
 * подписывалось не своим вариантом). */
export async function rememberFileId(
  examBot: ExamBotPort,
  entry: ImageAlbumEntry,
  sent: Message.PhotoMessage,
  sentWithBytes: boolean,
): Promise<void> {
  if (!sentWithBytes) return;
  const fileId = sent.photo.at(-1)?.file_id; // самый большой размер — последний
  if (fileId) await examBot.rememberTelegramFileId(entry.imageId, fileId);
}
