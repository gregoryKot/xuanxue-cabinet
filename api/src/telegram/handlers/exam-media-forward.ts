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
// 2 (находка 2, часть «сирота»). Подпись и видео — два вызова API
//    (video_note/«кружок» не поддерживает caption вовсе, единый приём для
//    всех видов вложения проще, чем разбирать, что поддерживает caption у
//    copyMessage). Раньше подпись шла первой: если она проходила, а
//    copyMessage с видео падал, учитель получал текст без единственного, что
//    в нём ценно, — видео. Теперь видео идёт первым: подпись без видео не
//    имеет смысла и не отправляется, видео без подписи — не идеальный, но
//    рабочий результат (учитель видит попытку, имя и экзамен можно уточнить
//    в кабинете), поэтому такой сбой — `warn`, не эскалация. Если видео не
//    дошло НИКОМУ из адресатов — это и есть тихий отказ, который CLAUDE.md
//    требует не терять: `error` с ключом для поиска (attemptId), без PII
//    (имя ученика в лог не идёт, см. api/src/logging/redact-paths.ts).
import { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { errorMessage } from '../../common/error-info';
import type { PersonalChat, PersonalChats } from '../personal-chats';
// Только тип: DI-инстанс приходит параметром из ExamMediaMessageHandler,
// здесь не инстанцируется — обычный import сделал бы класс рантайм-импортом
// без причины (CLAUDE.md «Импорты типов»).

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
      forwardOne(ctx, teacherChat.chatId, chat.id, message.message_id, caption),
    ),
  );
  if (delivered.every((ok) => !ok)) {
    logger.error(`telegram.examMedia.forward: видео не дошло ни одному адресату`, {
      attemptId,
      kind: 'attempt_submitted',
    });
  }
}

async function forwardOne(
  ctx: Context,
  toChatId: string,
  fromChatId: number,
  messageId: number,
  caption: string,
): Promise<boolean> {
  try {
    await ctx.telegram.copyMessage(toChatId, fromChatId, messageId);
  } catch (err) {
    // chatId — полем объекта, не в тексте (SECURITY §1 п.2, §4).
    logger.warn(
      { chatId: toChatId },
      `telegram.examMedia.forward.video: ${errorMessage(err)}`,
    );
    return false; // без видео подпись — сирота (находка 2), не шлём вовсе
  }
  try {
    await ctx.telegram.sendMessage(toChatId, caption);
  } catch (err) {
    logger.warn(
      { chatId: toChatId },
      `telegram.examMedia.forward.caption: ${errorMessage(err)}`,
    );
    // Видео уже дошло — главное получено, подпись теряем без эскалации.
  }
  return true;
}
