// /проверка, /review (латинский алиас — register-handlers.ts): список
// сданного и непроверенного (ТЗ 4б.5, PLAN §12) — тот же фильтр
// status=submitted, что очередь учителя в кабинете
// (ExamAttemptsService.list через ExamBotPort.listSubmittedAttempts, не
// вторая сборка). Доступ — тот же личный чат штата, что у /тема и
// /уведомления (resolvePrivatePersonalChatId, private-teacher-chat.ts).
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { errorMessage, errorStack } from '../../common/error-info';
import { UsersService } from '../../users/users.service';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { PersonalChats } from '../personal-chats';
import { buildGradeQueueScreen } from './grade-queue-screen';
import { resolvePrivatePersonalChatId } from './private-teacher-chat';

@Injectable()
export class GradeQueueHandler {
  private readonly logger = new Logger(GradeQueueHandler.name);

  constructor(
    private readonly personalChats: PersonalChats,
    private readonly usersService: UsersService,
    private readonly examBotPorts: ExamBotPortRegistry,
  ) {}

  async handle(ctx: Context, now: DateTime): Promise<void> {
    try {
      const chatId = await resolvePrivatePersonalChatId(ctx, this.personalChats, now);
      if (chatId === null) return;

      const user = await this.usersService.findByTelegramId(chatId);
      if (!user) return;

      const attempts = await this.examBotPorts.get().listSubmittedAttempts(user, now);
      const screen = buildGradeQueueScreen(attempts);
      await ctx
        .reply(screen.text, { reply_markup: { inline_keyboard: screen.buttons } })
        .catch(() => null);
    } catch (err) {
      this.logger.error(`telegram./проверка: ${errorMessage(err)}`, errorStack(err));
    }
  }
}
