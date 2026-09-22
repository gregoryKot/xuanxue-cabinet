// Отправка картинок вариантов (ADR-0118, ADR-0035, docs/PLAN.md §12 слой
// 4б.2) — сборка списка в exam-question-album.ts (файл-лимит CLAUDE.md),
// здесь только связь с Telegram: bytes/file_id через ExamBotPort (комментарий
// в exam-bot.port.ts), кэш file_id и деградация при сбое — экран вопроса
// показываем в любом случае, кнопки «Вариант N» работают и без фото
// (CLAUDE.md «Ноль нагрузки»).
//
// Каждая картинка — отдельным sendPhoto со своей подписью (ADR-0118, жалоба
// тестировщика 2026-09-22): sendMediaGroup схлопывает 2+ фото в сетку, и
// подписи отдельных плиток в ленте не видны — только если открыть фото на
// весь экран. Порядок — последовательно (`for … of`, не `Promise.all`):
// Telegram держит порядок сообщений только при последовательной отправке.
import { Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import type { InputFile, Message } from 'telegraf/types';
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

// SECURITY §1: attemptId/imageId — полями объекта, не в тексте строки.
function warnPhotoFailed(attemptId: string, entry: OptionAlbumEntry, err: unknown): void {
  logger.warn(`telegram.examOptionAlbum: ${errorMessage(err)}`, {
    attemptId,
    imageId: entry.imageId,
  });
}

/** file_id, которым Telegram отказался слать (например, сменили бота), —
 * второй и последний раз пробуем байтами. Без кэша ретраить нечем — обычный
 * сбой одной картинки не отменяет остальные (вызывающий код продолжает цикл). */
async function sendOnePhoto(
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
async function rememberFileId(
  examBot: ExamBotPort,
  entry: OptionAlbumEntry,
  sent: Message.PhotoMessage,
  sentWithBytes: boolean,
): Promise<void> {
  if (!sentWithBytes) return;
  const fileId = sent.photo.at(-1)?.file_id; // самый большой размер — последний
  if (fileId) await examBot.rememberTelegramFileId(entry.imageId, fileId);
}

/** Перед экраном кнопок вопроса — фото вариантов, каждое своим сообщением со
 * своей подписью (ADR-0118, PLAN.md §12 слой 4б.2). Сбой — деградация, не
 * отказ: экран показывает вызывающий код в любом случае. */
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

  for (const r of resolved) {
    const result = await sendOnePhoto(ctx, chatId, r, attemptId);
    if (!result) continue;
    await rememberFileId(examBot, r.entry, result.sent, result.sentWithBytes).catch(
      (err: unknown) =>
        logger.warn(`telegram.examOptionAlbum.remember: ${errorMessage(err)}`, {
          attemptId,
          imageId: r.entry.imageId,
        }),
    );
  }
}
