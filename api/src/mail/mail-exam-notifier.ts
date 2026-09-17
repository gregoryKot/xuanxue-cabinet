// Почтовый резерв ExamNotifier (слой 4.7, PLAN §11, ADR-0039): письмо уходит
// только тем, у кого НЕТ активного личного чата с ботом — Telegram остаётся
// основным каналом, письмо не дублирует его тем же событием. Три условия
// одинаковы для обоих видов: подтверждённый email (сам факт входа по
// одноразовой ссылке — EmailLoginUserService), вид уведомления включён
// (NotificationPrefsService, те же правила, что у TelegramExamNotifier) и
// нет активного чата (PersonalChats.hasActiveChat). Отправка — best-effort:
// сбой резолва ловится try/catch и уходит в Logger.warn, сбой самой отправки
// (MailService.sendExamNotification вернул `false`) — error, тем же приёмом,
// что у TelegramExamNotifier (аудит 2026-09, находка 2: тихий отказ дороже
// всего именно здесь). CompositeExamNotifier (exams/exam-notifier.composite.ts)
// зовёт этот класс наравне с TelegramExamNotifier.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import type { NotificationKind, UserRole } from '@xuanxue/shared';
import { errorMessage } from '../common/error-info';
import type {
  AttemptSubmittedContext,
  ExamGradedContext,
  ExamNotifier,
} from '../exams/exam-notifier';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { PersonalChats } from '../telegram/personal-chats';
import type { StaffEmailContact } from '../users/list-staff-with-email';
import { UserNamesService } from '../users/user-names.service';
import { UsersService } from '../users/users.service';
import { attemptSubmittedMail } from './attempt-submitted-mail';
import { examGradedMail } from './exam-graded-mail';
import { MailService } from './mail.service';

const ATTEMPT_SUBMITTED_KIND: NotificationKind = 'attempt_submitted';
const EXAM_RESULT_KIND: NotificationKind = 'exam_result';

@Injectable()
export class MailExamNotifier implements ExamNotifier {
  private readonly logger = new Logger(MailExamNotifier.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly userNamesService: UserNamesService,
    private readonly personalChats: PersonalChats,
    private readonly notificationPrefsService: NotificationPrefsService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  async notifyAttemptSubmitted(
    context: AttemptSubmittedContext,
    _now: DateTime,
  ): Promise<void> {
    try {
      const recipients = await this.staffWithoutChat(ATTEMPT_SUBMITTED_KIND);
      if (recipients.length === 0) return;

      const names = await this.userNamesService.namesByIds([context.userId]);
      const studentName = names.get(context.userId) ?? 'Ученик';
      const { subject, text } = attemptSubmittedMail(
        studentName,
        context.examTitle,
        context.attemptId,
        this.config.get<string>('PUBLIC_URL'),
      );
      const delivered = await Promise.all(
        recipients.map((r) =>
          this.mailService.sendExamNotification({ to: r.email, subject, text }),
        ),
      );
      if (delivered.every((ok) => !ok)) {
        this.logger.error(
          `exam.notifyAttemptSubmitted (почта): доставка не удалась ни одному из ${delivered.length} писем`,
          { attemptId: context.attemptId, kind: ATTEMPT_SUBMITTED_KIND },
        );
      }
    } catch (err) {
      this.logger.warn(`exam.notifyAttemptSubmitted (почта): ${errorMessage(err)}`, {
        attemptId: context.attemptId,
      });
    }
  }

  async notifyExamGraded(context: ExamGradedContext, _now: DateTime): Promise<void> {
    try {
      const user = await this.usersService.findById(context.userId);
      if (!user?.email) return;
      const canSend = await this.isEnabledWithoutChat(
        context.userId,
        user.roles,
        EXAM_RESULT_KIND,
      );
      if (!canSend) return;

      const { subject, text } = examGradedMail(
        context.examTitle,
        context.outcome,
        context.comment,
        this.config.get<string>('PUBLIC_URL'),
      );
      const delivered = await this.mailService.sendExamNotification({
        to: user.email,
        subject,
        text,
      });
      if (!delivered) {
        this.logger.error(`exam.notifyExamGraded (почта): доставка не удалась`, {
          attemptId: context.attemptId,
          kind: EXAM_RESULT_KIND,
        });
      }
    } catch (err) {
      this.logger.warn(`exam.notifyExamGraded (почта): ${errorMessage(err)}`, {
        attemptId: context.attemptId,
      });
    }
  }

  /** Штат с почтой, у кого включён этот вид уведомления и нет активного
   * Telegram-чата. Штат школы маленький (один преподавательский состав на
   * школу, PLAN.md §1) — hasActiveChat по одному человеку в Promise.all не
   * превращается в проблему масштаба, как N+1 у большого списка. */
  private async staffWithoutChat(
    kind: NotificationKind,
  ): Promise<Pick<StaffEmailContact, 'id' | 'email'>[]> {
    const staff = await this.usersService.listStaffWithEmail();
    if (staff.length === 0) return [];

    const enabledByUser = await this.notificationPrefsService.getManyEnabled(
      staff.map((s) => ({ id: s.id, roles: s.roles })),
    );
    const eligible = staff.filter((s) => enabledByUser.get(s.id)?.includes(kind));
    if (eligible.length === 0) return [];

    const withChatFlag = await Promise.all(
      eligible.map(async (s) => ({
        id: s.id,
        email: s.email,
        hasChat: await this.personalChats.hasActiveChat(s.id),
      })),
    );
    return withChatFlag.filter((s) => !s.hasChat).map(({ id, email }) => ({ id, email }));
  }

  private async isEnabledWithoutChat(
    userId: string,
    roles: UserRole[],
    kind: NotificationKind,
  ): Promise<boolean> {
    const prefs = await this.notificationPrefsService.get(userId, roles);
    if (!prefs.enabled.includes(kind)) return false;
    return !(await this.personalChats.hasActiveChat(userId));
  }
}
