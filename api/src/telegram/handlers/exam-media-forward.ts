// Пересылка видео экзамена в личку учителям/помощникам (ADR-0023) — вынесена
// из exam-media-message.handler.ts (CLAUDE.md «Файлы»: файл-лимит). Два
// исправления аудита 2026-09:
//
// 1 (находка 1). Раньше шли `personalChats.list(now)` — весь штат с
//    подключённым ботом, мимо переключателя уведомлений. Правильный
//    получатель тот же, что у текстового «работу сдали»
//    (TelegramExamNotifier.notifyAttemptSubmitted) — `listFor('attempt_submitted', …)`:
//    сотрудник выключил этот вид, видео ему тоже не идёт; админу, у которого
//    вида нет по дефолту роли (shared/src/notifications.ts, отзыв владельца
//    2026-09-12: «он не проверяет работы»), видео не приходит вовсе.
//
// 2 (находка 2, часть «сирота»). Видео первым, подпись вторым — механика
//    самой пересылки общая с payment-screenshot-forward.ts (скриншот
//    оплаты, ADR-0050) и вынесена в forward-photo-with-caption.ts (комментарий
//    там же объясняет порядок и почему сбой подписи — не авария). Если видео
//    не дошло НИКОМУ из адресатов — это и есть тихий отказ, который CLAUDE.md
//    требует не терять: `error` с ключом для поиска (attemptId), без PII
//    (имя ученика в лог не идёт, см. api/src/logging/redact-paths.ts).
import { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { PersonalChat, PersonalChats } from '../personal-chats';
import { forwardPhotoWithCaption } from './forward-photo-with-caption';

const logger = new Logger('examMediaForward');

export async function forwardExamVideoToTeachers(
  ctx: Context,
  personalChats: PersonalChats,
  studentName: string,
  examTitle: string,
  attemptId: string,
  now: DateTime,
): Promise<void> {
  const message = ctx.message;
  const chat = ctx.chat;
  if (!chat || !message) return;

  const chats = await personalChats.listFor('attempt_submitted', now);
  if (chats.length === 0) return; // пустой список — свой warn раз в час внутри PersonalChats

  const caption = `Видео от ${studentName} — экзамен «${examTitle}».`;
  const delivered = await Promise.all(
    chats.map((teacherChat: PersonalChat) =>
      forwardPhotoWithCaption(
        ctx,
        teacherChat.chatId,
        chat.id,
        message.message_id,
        caption,
        'telegram.examMedia.forward',
      ),
    ),
  );
  if (delivered.every((ok) => !ok)) {
    logger.error(`telegram.examMedia.forward: видео не дошло ни одному адресату`, {
      attemptId,
      kind: 'attempt_submitted',
    });
  }
}
