// chat_member — статус ДРУГОГО участника чата изменился (не самого бота —
// это my_chat_member, chat-member.handler.ts, разные апдейты Telegram).
// Ловит момент, когда человека добавили в группу учеников ПОСЛЕ того, как
// он уже открыл кабинет и получил `invited` — без этого он ждёт ручной
// кнопки на «Людях» или следующего входа (ADR-0026, CLAUDE.md «Ноль
// нагрузки на ученика»).
//
// ВНИМАНИЕ, требование к боту: Telegram присылает `chat_member` только если
// бот — администратор чата (обычного участника такие апдейты не касаются).
// Без этого права апдейт молча не приходит — школа не узнает о вступлении
// до следующего входа человека (тихий отказ, RUNBOOK §8.15, PLAN.md «Вход и
// роли»). Апдейт ещё и должен быть в ALLOWED_UPDATES при регистрации
// вебхука (telegram-bot.service.ts) — иначе Telegram его не отправит вовсе.
//
// Статус нового участника здесь не фильтруется отдельным списком: решает
// живая проверка в GroupMembershipService.isMemberOfSchoolGroup (тот же
// код, что при входе) — на left/kicked она вернёт false и просто ничего не
// подтвердит, второй список статусов заводить незачем.
import { Injectable, Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import { errorMessage, errorStack } from '../../common/error-info';
import { StudentMembershipApprovalService } from '../../users/student-membership-approval.service';
import { UsersService } from '../../users/users.service';

@Injectable()
export class ChatMemberJoinHandler {
  private readonly logger = new Logger(ChatMemberJoinHandler.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly approval: StudentMembershipApprovalService,
  ) {}

  async handle(ctx: Context): Promise<void> {
    const update = ctx.chatMember;
    if (!update) return;

    const telegramId = update.new_chat_member.user.id;
    try {
      const user = await this.usersService.findByTelegramId(telegramId);
      // Не наш пользователь (или ещё не входил в кабинет ни разу) — нечего
      // подтверждать; confirmIfMember сам не тронет никого, кроме `invited`.
      if (!user) return;
      await this.approval.confirmIfMember(user);
    } catch (err) {
      this.logger.error(`telegram.chat_member: ${errorMessage(err)}`, errorStack(err));
    }
  }
}
