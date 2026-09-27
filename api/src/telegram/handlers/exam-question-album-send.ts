// Отправка медиа вопроса и вариантов (ADR-0118, ADR-0035, ADR-0133, docs/PLAN.md
// §12 слой 4б.2) — сборка списка в exam-question-album.ts (файл-лимит CLAUDE.md),
// здесь связь с Telegram: картинки — целиком в этом файле (bytes/file_id через
// ExamBotPort, кэш file_id, деградация при сбое), видео и ссылки — в
// exam-question-video-send.ts (тот же файл-лимит), эта функция только
// перебирает общий список в порядке ADR-0133 и зовёт нужный отправитель по
// `kind`. Экран вопроса показываем в любом случае, кнопки «Вариант N»
// работают и без медиа (CLAUDE.md «Ноль нагрузки»).
//
// Каждая картинка — отдельным sendPhoto со своей подписью (ADR-0118, жалоба
// тестировщика 2026-09-22): sendMediaGroup схлопывает 2+ фото в сетку, и
// подписи отдельных плиток в ленте не видны — только если открыть фото на
// весь экран. Порядок — последовательно (`for … of`, не `Promise.all`):
// Telegram держит порядок сообщений только при последовательной отправке.
import { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { InputFile, Message } from 'telegraf/types';
import type { ExamImageContentType } from '@xuanxue/shared';
import { errorMessage } from '../../common/error-info';
import type { UserLean } from '../../users/users.service';
import type { BotOptionImage, ExamBotPort } from '../exam-bot.port';
import type { ImageAlbumEntry, OptionAlbumEntry } from './exam-question-album';
import { sendOptionVideo, sendVideoLink } from './exam-question-video-send';

const logger = new Logger('examOptionAlbum');

const CONTENT_TYPE_EXTENSION: Record<ExamImageContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

interface ResolvedOption {
  entry: ImageAlbumEntry;
  image: BotOptionImage;
}

/** Картинка могла исчезнуть между снимком и показом (сирота-уборщик,
 * ADR-0035) или оказаться не своей — пропускаем это фото, а не весь вопрос. */
async function resolveImages(
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
  entry: ImageAlbumEntry,
  sent: Message.PhotoMessage,
  sentWithBytes: boolean,
): Promise<void> {
  if (!sentWithBytes) return;
  const fileId = sent.photo.at(-1)?.file_id; // самый большой размер — последний
  if (fileId) await examBot.rememberTelegramFileId(entry.imageId, fileId);
}

/** Перед экраном кнопок вопроса — медиа вопроса и вариантов, каждое своим
 * сообщением (ADR-0118, ADR-0133, PLAN.md §12 слой 4б.2), в исходном порядке
 * списка (exam-question-album.ts): картинки резолвятся заранее одним
 * Promise.all (как раньше), видео и ссылки — прямо по ходу цикла, поэтому
 * порядок отправки не зависит от того, когда именно резолвится картинка.
 * Сбой — деградация, не отказ: экран показывает вызывающий код в любом
 * случае. `questionVideoFailed` — не удалось показать видео САМОГО вопроса
 * (R2 выключено, объект пропал, сбой отправки) — вызывающий код
 * (exam-question-render.ts) решает, показывать ли отметку «видео в кабинете». */
export async function sendOptionAlbum(
  ctx: Context,
  examBot: ExamBotPort,
  user: UserLean,
  chatId: number,
  album: OptionAlbumEntry[],
  attemptId: string,
  now: DateTime,
): Promise<{ questionVideoFailed: boolean }> {
  if (album.length === 0) return { questionVideoFailed: false };

  const imageEntries = album.filter(
    (entry): entry is ImageAlbumEntry => entry.kind === 'image',
  );
  // Сбой чтения байтов (Mongo, шифрование) — тоже деградация: к этому
  // моменту старое сообщение-экран уже удалено (presentAttemptScreen), и
  // упавшее исключение оставило бы ученика вовсе без экрана.
  let resolvedImages: ResolvedOption[] = [];
  if (imageEntries.length > 0) {
    try {
      resolvedImages = await resolveImages(examBot, user, imageEntries);
    } catch (err) {
      logger.warn(`telegram.examOptionAlbum.load: ${errorMessage(err)}`, { attemptId });
    }
  }
  const imageByEntry = new Map(resolvedImages.map((r) => [r.entry, r.image]));

  let questionVideoFailed = false;
  for (const entry of album) {
    if (entry.kind === 'image') {
      const image = imageByEntry.get(entry);
      if (!image) continue; // не нашлась — без шума (лог уже был выше при сбое чтения)
      const result = await sendOnePhoto(ctx, chatId, { entry, image }, attemptId);
      if (!result) continue;
      await rememberFileId(examBot, entry, result.sent, result.sentWithBytes).catch(
        (err: unknown) =>
          logger.warn(`telegram.examOptionAlbum.remember: ${errorMessage(err)}`, {
            attemptId,
            imageId: entry.imageId,
          }),
      );
    } else if (entry.kind === 'video') {
      const sent = await sendOptionVideo(
        ctx,
        examBot,
        user,
        chatId,
        entry,
        attemptId,
        now,
      );
      if (!sent && entry.optionIndex === undefined) questionVideoFailed = true;
    } else {
      await sendVideoLink(ctx, chatId, entry);
    }
  }
  return { questionVideoFailed };
}
