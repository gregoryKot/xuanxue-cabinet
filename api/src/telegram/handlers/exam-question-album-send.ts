// Отправка альбома вариантов (ADR-0035, docs/PLAN.md §12 слой 4б.2) — сборка
// списка в exam-question-album.ts (файл-лимит CLAUDE.md), здесь только связь
// с Telegram: bytes/file_id через ExamBotPort (комментарий в exam-bot.port.ts),
// кэш file_id и деградация при сбое — экран вопроса показываем в любом
// случае, кнопки «Вариант N» работают и без фото (CLAUDE.md «Ноль нагрузки»).
import { Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import type { InputFile, InputMediaPhoto, Message } from 'telegraf/types';
import type { ExamImageContentType } from '@xuanxue/shared';
import { errorMessage } from '../../common/error-info';
import type { UserLean } from '../../users/users.service';
import type { BotOptionImage, ExamBotPort } from '../exam-bot.port';
import type { OptionAlbumEntry } from './exam-question-album';

const logger = new Logger('examOptionAlbum');

const CONTENT_TYPE_EXTENSION: Record<ExamImageContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

interface ResolvedOption {
  entry: OptionAlbumEntry;
  image: BotOptionImage;
}

/** Картинка могла исчезнуть между снимком и показом (сирота-уборщик,
 * ADR-0035) или оказаться не своей — пропускаем это фото, а не весь вопрос. */
async function resolveImages(
  examBot: ExamBotPort,
  user: UserLean,
  album: OptionAlbumEntry[],
): Promise<ResolvedOption[]> {
  const images = await Promise.all(
    album.map((entry) => examBot.loadOptionImage(entry.imageId, user)),
  );
  return album.flatMap((entry, i) => {
    const image = images[i];
    return image ? [{ entry, image }] : [];
  });
}

function toInputFile(entry: OptionAlbumEntry, image: BotOptionImage): InputFile {
  const ext = CONTENT_TYPE_EXTENSION[image.contentType];
  return { source: image.bytes, filename: `variant-${entry.optionIndex + 1}.${ext}` };
}

function toInputMedia(resolved: ResolvedOption, forceBytes: boolean): InputMediaPhoto {
  const { entry, image } = resolved;
  const media =
    !forceBytes && image.telegramFileId
      ? image.telegramFileId
      : toInputFile(entry, image);
  return { type: 'photo', media, caption: entry.caption };
}

/** Одна картинка — sendPhoto, 2–10 — sendMediaGroup (ТЗ бота); optionsMax
 * (EXAM_ITEM_LIMITS) держит альбом в пределах лимита Telegram на альбом. */
async function sendResolved(
  ctx: Context,
  chatId: number,
  resolved: ResolvedOption[],
  forceBytes: boolean,
): Promise<Message.PhotoMessage[]> {
  const media = resolved.map((r) => toInputMedia(r, forceBytes));
  if (media.length === 1) {
    const single = media[0];
    if (!single) return [];
    const sent = await ctx.telegram.sendPhoto(chatId, single.media, {
      caption: single.caption,
    });
    return [sent];
  }
  const sent = await ctx.telegram.sendMediaGroup(chatId, media);
  return sent.filter((m): m is Message.PhotoMessage => 'photo' in m);
}

/** Только для того, что реально ушло байтами: если file_id уже знали и
 * отправка им удалась, Telegram просто пересылает тот же файл — писать в
 * базу то же самое значение незачем. */
async function rememberNewFileIds(
  examBot: ExamBotPort,
  resolved: ResolvedOption[],
  sent: Message.PhotoMessage[],
  forceBytes: boolean,
): Promise<void> {
  await Promise.all(
    resolved.map((r, i) => {
      if (!forceBytes && r.image.telegramFileId) return Promise.resolve();
      const fileId = sent[i]?.photo.at(-1)?.file_id; // самый большой размер — последний
      return fileId
        ? examBot.rememberTelegramFileId(r.entry.imageId, fileId)
        : Promise.resolve();
    }),
  );
}

// SECURITY §1: attemptId/imageId — полями объекта, не в тексте строки.
function warnAlbumFailed(
  attemptId: string,
  resolved: ResolvedOption[],
  err: unknown,
): void {
  logger.warn(`telegram.examOptionAlbum: ${errorMessage(err)}`, {
    attemptId,
    imageId: resolved.map((r) => r.entry.imageId).join(','),
  });
}

/** file_id, которым Telegram отказался слать (например, сменили бота), —
 * второй и последний раз пробуем байтами. Без кэша ретраить нечем — обычный сбой. */
async function sendWithRetry(
  ctx: Context,
  chatId: number,
  resolved: ResolvedOption[],
  attemptId: string,
): Promise<{ sent: Message.PhotoMessage[]; sentWithBytes: boolean } | null> {
  const hadCachedFileId = resolved.some((r) => r.image.telegramFileId);
  try {
    const sent = await sendResolved(ctx, chatId, resolved, false);
    return { sent, sentWithBytes: !hadCachedFileId };
  } catch (err) {
    if (!hadCachedFileId) {
      warnAlbumFailed(attemptId, resolved, err);
      return null;
    }
  }
  try {
    const sent = await sendResolved(ctx, chatId, resolved, true);
    return { sent, sentWithBytes: true };
  } catch (retryErr) {
    warnAlbumFailed(attemptId, resolved, retryErr);
    return null;
  }
}

/** Перед экраном кнопок вопроса — фото вариантов (ТЗ бота, PLAN.md §12 слой
 * 4б.2). Сбой — деградация, не отказ: экран показывает вызывающий код в любом случае. */
export async function sendOptionAlbum(
  ctx: Context,
  examBot: ExamBotPort,
  user: UserLean,
  chatId: number,
  album: OptionAlbumEntry[],
  attemptId: string,
): Promise<void> {
  if (album.length === 0) return;
  // Сбой чтения байтов (Mongo, шифрование) — тоже деградация: к этому
  // моменту старое сообщение-экран уже удалено (presentAttemptScreen), и
  // упавшее исключение оставило бы ученика вовсе без экрана.
  let resolved: ResolvedOption[];
  try {
    resolved = await resolveImages(examBot, user, album);
  } catch (err) {
    logger.warn(`telegram.examOptionAlbum.load: ${errorMessage(err)}`, { attemptId });
    return;
  }
  if (resolved.length === 0) return; // ни одна картинка не нашлась — без шума

  const result = await sendWithRetry(ctx, chatId, resolved, attemptId);
  if (!result) return;
  await rememberNewFileIds(examBot, resolved, result.sent, result.sentWithBytes).catch(
    (err: unknown) =>
      logger.warn(`telegram.examOptionAlbum.remember: ${errorMessage(err)}`, {
        attemptId,
      }),
  );
}
