// exam_<attemptId>[_<itemId>] — deep link «Отправить видео» из кабинета
// (ADR-0023, ADR-0037 — вторая форма адресует вопрос, PLAN §11 слой 4.5),
// вынесено из StartHandler целиком (файл-лимит 150 строк, тот же приём, что
// и join-invite-deep-link.ts). Разбор обеих форм — start-payload.ts, сюда
// `itemId` приходит уже проверенным по формату (24 hex), не по смыслу — есть
// ли такой вопрос в снимке и это video, проверяет MediaAssetsService при
// самой привязке. Инцидент 2026-09-16
// (RUNBOOK §8.17): ученик вошёл по почте (нет telegramId), сдал экзамен,
// прислал видео в бота — получил «не нашли попытку». Причина: видео
// привязывается только владельцу попытки с привязанным Telegram (ADR-0023,
// это правило не меняем), а `unknown`-отправителю (нет записи в users —
// свой Telegram он ещё не привязал) заводили ожидание видео и узнавали
// правду только после присылки видео, в MediaAssetsService.attachTelegramVideo.
// Теперь `unknown` получает отказ сразу здесь, до ожидания: дешевле и
// честнее, чем NOT_A_VIDEO/ATTEMPT_NOT_YOURS после того, как человек уже
// снял и отправил видео (инцидент 2026-09-16, RUNBOOK §8.17). `denied`
// (blocked) — как раньше, готовый отказ, ожидание не заводим
// (SECURITY §9). `active` — заводит ожидание, как раньше.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { BotSessionService } from '../bot-session.service';
import type { BotUserAccessService } from '../bot-user-access.service';

export const TELEGRAM_NOT_LINKED_MESSAGE =
  'Этот Telegram не связан с вашим кабинетом, поэтому видео сюда не примем. ' +
  'Вернитесь в кабинет и вставьте ссылку на видео на экране попытки.';

const EXAM_MEDIA_WAIT_MESSAGE =
  'Снимите или пришлите видео прямо сюда — обычным сообщением, «кружком» ' +
  'или файлом. Как только дойдёт, учитель сможет его посмотреть.';

export interface ExamMediaDeepLinkDeps {
  botSessions: BotSessionService;
  botAccess: BotUserAccessService;
}

export async function handleExamMediaDeepLink(
  ctx: Context,
  telegramId: number,
  examAttemptId: string,
  now: DateTime,
  deps: ExamMediaDeepLinkDeps,
  itemId?: string,
): Promise<void> {
  const access = await deps.botAccess.resolve(telegramId);
  if (access.kind === 'denied') {
    await ctx.reply(access.message).catch(() => null);
    return;
  }
  if (access.kind === 'unknown') {
    await ctx.reply(TELEGRAM_NOT_LINKED_MESSAGE).catch(() => null);
    return;
  }
  await deps.botSessions.startExamMediaWait(
    telegramId,
    examAttemptId,
    now,
    undefined,
    itemId,
  );
  await ctx.reply(EXAM_MEDIA_WAIT_MESSAGE).catch(() => null);
}
