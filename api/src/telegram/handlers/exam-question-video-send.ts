// Отправка видео вопроса/варианта (2026-09-27, «Уточнено» ADR-0133: владелец
// сообщил, что видео не видно ни в вопросе, ни в вариантах) — файл-лимит
// CLAUDE.md увёл это из exam-question-album-send.ts (там же — картинки,
// тот же образец: bytes/file_id через ExamBotPort, кэш file_id, деградация
// без исключения). Ссылка (YouTube и т.п.) — exam-question-video-link-send.ts
// (файл-лимит после F02).
//
// Байты читаются лениво — `video.loadBytes()` только в ветке «file_id нет»
// и «Telegram отверг file_id» (аудит 2026-10-01, F02): раньше объект R2 до
// 50 МБ ложился в память при каждом показе, даже когда уходила строка file_id.
import { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { InputFile } from 'telegraf/types';
import type { ExamVideoContentType } from '@xuanxue/shared';
import { isRejectedFileIdError } from '../../channels/telegram-errors';
import { errorMessage } from '../../common/error-info';
import type { UserLean } from '../../users/users.service';
import type { BotOptionVideo, ExamBotPort } from '../exam-bot.port';
import type { VideoAlbumEntry } from './exam-question-album';

const logger = new Logger('examOptionVideo');

const CONTENT_TYPE_EXTENSION: Record<ExamVideoContentType, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

function toInputFile(
  entry: VideoAlbumEntry,
  video: BotOptionVideo,
  bytes: Buffer,
): InputFile {
  const ext = CONTENT_TYPE_EXTENSION[video.contentType];
  const name =
    entry.optionIndex === undefined ? 'question' : `variant-${entry.optionIndex + 1}`;
  return { source: bytes, filename: `${name}.${ext}` };
}

// SECURITY §1: attemptId/videoId — полями объекта, не в тексте строки.
function warn(
  attemptId: string,
  entry: VideoAlbumEntry,
  reason: string,
  err?: unknown,
): void {
  logger.warn(
    `telegram.examOptionVideo: ${reason}${err ? `: ${errorMessage(err)}` : ''}`,
    {
      attemptId,
      videoId: entry.videoId,
    },
  );
}

/** Байтами — единственное место, где они читаются (F02): `loadBytes` бросает
 * NotAvailableError, если R2 выключен или объект пропал, — вызывающий код
 * считает это тем же сбоем отправки, что и отказ Telegram. */
async function sendBytes(
  ctx: Context,
  chatId: number,
  entry: VideoAlbumEntry,
  video: BotOptionVideo,
  caption: { caption?: string },
): Promise<string> {
  const bytes = await video.loadBytes();
  const sent = await ctx.telegram.sendVideo(
    chatId,
    toInputFile(entry, video, bytes),
    caption,
  );
  return sent.video.file_id;
}

/** `sent: false` — не ушло вовсе; `newFileId` — только когда видео реально
 * ушло байтами (первый раз или после отказа кэша), писать в базу то же
 * значение, которым уже отправляли, незачем (тот же приём, что у картинки,
 * exam-question-album-send.ts). Второй и последний раз пробуем байтами,
 * если Telegram отказался принять сам file_id (сменили бота). */
async function sendBytesOrFileId(
  ctx: Context,
  chatId: number,
  entry: VideoAlbumEntry,
  video: BotOptionVideo,
  attemptId: string,
): Promise<{ sent: true; newFileId: string | null } | { sent: false }> {
  const hadCachedFileId = Boolean(video.telegramFileId);
  const caption = entry.caption ? { caption: entry.caption } : {};
  if (video.telegramFileId) {
    try {
      await ctx.telegram.sendVideo(chatId, video.telegramFileId, caption);
      return { sent: true, newFileId: null };
    } catch (err) {
      // Байтами — только когда Telegram отверг сам file_id. 429/5xx/сеть:
      // чтение объекта из R2 и повтор получат тот же отказ (F02, ревью #531).
      if (!isRejectedFileIdError(err)) {
        warn(attemptId, entry, 'сбой отправки по file_id', err);
        return { sent: false };
      }
      warn(attemptId, entry, 'Telegram отверг file_id, пробуем байтами', err);
    }
  }
  try {
    return { sent: true, newFileId: await sendBytes(ctx, chatId, entry, video, caption) };
  } catch (err) {
    const reason = hadCachedFileId
      ? 'сбой отправки байтами после отказа file_id'
      : 'сбой отправки';
    warn(attemptId, entry, reason, err);
    return { sent: false };
  }
}

/** Одно видео — от доступа к нему до отправки и кэша file_id. `false` —
 * видео не показано (R2 выключен, объект пропал, доступа нет, сбой отправки):
 * вызывающий код («Ноль нагрузки на ученика») решает, нужна ли текстовая
 * отметка про кабинет — сейчас только для видео самого вопроса
 * (exam-question-render.ts). */
export async function sendOptionVideo(
  ctx: Context,
  examBot: ExamBotPort,
  user: UserLean,
  chatId: number,
  entry: VideoAlbumEntry,
  attemptId: string,
  now: DateTime,
): Promise<boolean> {
  let video: BotOptionVideo | null;
  try {
    video = await examBot.loadOptionVideo(entry.videoId, user, now);
  } catch (err) {
    warn(attemptId, entry, 'сбой чтения', err);
    return false;
  }
  if (!video) {
    warn(attemptId, entry, 'недоступно (нет записи или не своё)');
    return false;
  }
  const outcome = await sendBytesOrFileId(ctx, chatId, entry, video, attemptId);
  if (!outcome.sent) return false;
  if (outcome.newFileId) {
    await examBot
      .rememberVideoFileId(entry.videoId, outcome.newFileId)
      .catch((err: unknown) =>
        warn(attemptId, entry, 'не удалось запомнить file_id', err),
      );
  }
  return true;
}
