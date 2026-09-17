// Следующий экран после того, как видео экзамена привязано ИЗНУТРИ потока
// вопросов бота (ТЗ 4б.2 часть 2) — в отличие от deep link «Отправить видео»
// из кабинета (ADR-0023, StartHandler), тут есть активный экран вопроса, к
// которому нужно вернуться: тот же приём, что exam-text-answer.handler.ts —
// новым сообщением (presentAttemptScreen, via: 'reply'), редактировать нечего.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { UserLean } from '../../users/users.service';
import type { BotSessionService } from '../bot-session.service';
import type { ExamBotPort } from '../exam-bot.port';
import { flattenAttemptQuestions } from './exam-question-screen';
import { presentAttemptScreen, renderAttemptScreen } from './exam-question-render';

export async function renderExamMediaAnswer(
  ctx: Context,
  examBot: ExamBotPort,
  botSessions: BotSessionService,
  telegramId: number,
  user: UserLean,
  attemptId: string,
  questionIndex: number,
  now: DateTime,
): Promise<void> {
  const attempt = await examBot.loadOwnAttempt(attemptId, user, now);
  if (!attempt) return; // попытка пропала между привязкой и рендером — маловероятно, не падаем

  // Видео — один ответ на всю попытку, не на вопрос (ADR-0023): сохранять
  // нечего, привязка сама по себе и есть ответ. Дальше — как text/single:
  // сообщение отправлено — вопрос закрыт, экран переходит к следующему.
  const total = flattenAttemptQuestions(attempt).length;
  const nextIndex = Math.min(questionIndex + 1, total - 1);
  const view = await renderAttemptScreen(
    botSessions,
    telegramId,
    attempt,
    nextIndex,
    now,
  );
  await presentAttemptScreen(
    ctx,
    { examBot, user, chatId: telegramId, attemptId },
    view,
    { via: 'reply', withAlbum: true },
  );
}
