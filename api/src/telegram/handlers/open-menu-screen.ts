// «Экзамены» и «В меню» из главного меню бота — открыты и штату, и ученику
// (ADR-0027, docs/PLAN.md §11 слой 4.7), в отличие от остальных кнопок
// CallbackQueryHandler (та же причина, что у кнопок экзамена — сдающий не
// обязан быть штатом школы). Вынесено из CallbackQueryHandler (файл-лимит
// 150 строк, CLAUDE.md «Храповики»). Доступ — BotUserAccessService, не
// PersonalChats: та отвечает только «штат ли это».
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { isStaffRole } from '@xuanxue/shared';
import type { BotUserAccessService } from '../bot-user-access.service';
import { buildBotMenu, buildStudentMenu, type BotMenu } from './bot-menu';
import type { ExamCommandHandler } from './exam-command.handler';

async function editMenuMessage(ctx: Context, menu: BotMenu): Promise<void> {
  await ctx
    .editMessageText(menu.text, { reply_markup: { inline_keyboard: menu.buttons } })
    .catch(() => null);
}

export async function handleOpenMenuScreen(
  ctx: Context,
  screen: 'exams' | 'back',
  chatId: number,
  now: DateTime,
  botAccess: BotUserAccessService,
  examCommandHandler: ExamCommandHandler,
): Promise<void> {
  if (screen === 'exams') {
    // Доступ (штат/ученик/blocked/invited) уже встроен в listScreen — тот
    // же рендер, что у команды /exams.
    const menu = await examCommandHandler.listScreen(chatId, now);
    if (menu) await editMenuMessage(ctx, menu);
    return;
  }
  const access = await botAccess.resolve(chatId);
  if (access.kind === 'denied') {
    await ctx.editMessageText(access.message).catch(() => null);
    return;
  }
  if (access.kind !== 'active') return;
  await editMenuMessage(
    ctx,
    isStaffRole(access.user.roles) ? buildBotMenu() : buildStudentMenu(),
  );
}
