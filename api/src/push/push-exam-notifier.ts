// PushExamNotifier — третье плечо ExamNotifier рядом с InAppExamNotifier
// (api/src/notifications/in-app-exam-notifier.ts) и TelegramExamNotifier
// (api/src/telegram/telegram-exam-notifier.ts), ADR-0092 «Порядок работ»
// PR №4: пустой пинг вместо сообщения — устройство само разбудит вкладку,
// web/public/sw.js прочитает свежую строку из ленты кабинета. Push — не
// ChannelAdapter (ADR-0092 «Альтернативы»): адресат — конкретный человек по
// userId, не канал школы, поэтому собирается здесь же, третьим провайдером
// ExamsModule, тем же приёмом, что и два соседних плеча.
//
// Адресаты notifyAttemptSubmitted (штат школы) — по роли и включённому виду
// через NotificationPrefsService, той же формой резолва, что у writeToStaff
// (in-app-staff-write.ts) и PersonalChats.listFor (personal-chats.ts): роли
// вида — кандидаты (rolesWithNotification), из них — только те, кому вид
// сейчас включён (getManyEnabled одной выборкой на весь список). Третья
// реализация того же резолва не вынесена в общий модуль намеренно: мера
// «дошло» у push своя (число подписок, не число людей с чатом или ролью), и
// slice получился бы либо шире, чем нужно двум другим, либо у push всё равно
// остался бы собственный шаг «сколько подписок разом» — обошлось без нового
// модуля ради четырёх строк (CLAUDE.md «Дубли»: сверено jscpd). Адресат
// notifyExamGraded (один конкретный человек по userId) — общий с
// InAppExamNotifier.notifyExamGraded шаг findNotifiedUser (notified-user.ts):
// этот повтор jscpd поймал буквально, поэтому вынесен.
//
// Отправка — best-effort и не бросает наружу: сбой резолва (Mongo) ловится
// try/catch, тем же приёмом, что у соседних плеч. Сама попытка отправки
// (сеть, мёртвая подписка) никогда не бросает — это гарантия PushSenderService.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { rolesWithNotification, type NotificationKind } from '@xuanxue/shared';
import { errorMessage } from '../common/error-info';
import type {
  AttemptSubmittedContext,
  ExamGradedContext,
  ExamNotifier,
  ExamNotifyResult,
} from '../exams/exam-notifier';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { findNotifiedUser } from '../notifications/notified-user';
import { UsersService } from '../users/users.service';
import { PushSenderService } from './push-sender.service';

const ATTEMPT_SUBMITTED_KIND: NotificationKind = 'attempt_submitted';
const EXAM_RESULT_KIND: NotificationKind = 'exam_result';

@Injectable()
export class PushExamNotifier implements ExamNotifier {
  private readonly logger = new Logger(PushExamNotifier.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly notificationPrefsService: NotificationPrefsService,
    private readonly pushSender: PushSenderService,
  ) {}

  async notifyAttemptSubmitted(
    context: AttemptSubmittedContext,
    now: DateTime,
  ): Promise<ExamNotifyResult> {
    try {
      const staff = await this.usersService.listActiveWithRoles(
        rolesWithNotification(ATTEMPT_SUBMITTED_KIND),
      );
      if (staff.length === 0) return { recipients: 0 };

      const enabledByUser = await this.notificationPrefsService.getManyEnabled(staff);
      const targets = staff.filter((s) =>
        enabledByUser.get(s.id)?.includes(ATTEMPT_SUBMITTED_KIND),
      );
      if (targets.length === 0) return { recipients: 0 };

      const attempted = await Promise.all(
        targets.map((t) => this.pushSender.sendToUser(t.id, now)),
      );
      // Адресат «взят в работу», только если у него была хоть одна
      // подписка — человек с включённым видом, но без единого устройства,
      // push получить не может (тот же довод, что у PersonalChats.chatFor:
      // включённый вид без канала связи — не адресат).
      return { recipients: attempted.filter((count) => count > 0).length };
    } catch (err) {
      this.logger.warn(`exam.notifyAttemptSubmitted (push): ${errorMessage(err)}`, {
        attemptId: context.attemptId,
      });
      return { recipients: 0 };
    }
  }

  // `now` — не только TTL самой подписи (vapid-jwt.ts): вызывающие сервисы
  // и так держат его под рукой, второй DateTime.utc() здесь не заводим
  // (CLAUDE.md «Время»), тем же приёмом, что у TelegramExamNotifier.
  async notifyExamGraded(
    context: ExamGradedContext,
    now: DateTime,
  ): Promise<ExamNotifyResult> {
    try {
      const user = await findNotifiedUser(this.deps(), context.userId, EXAM_RESULT_KIND);
      if (!user) return { recipients: 0 };

      const attempted = await this.pushSender.sendToUser(user.id, now);
      return { recipients: attempted > 0 ? 1 : 0 };
    } catch (err) {
      this.logger.warn(`exam.notifyExamGraded (push): ${errorMessage(err)}`, {
        attemptId: context.attemptId,
      });
      return { recipients: 0 };
    }
  }

  private deps() {
    return {
      usersService: this.usersService,
      notificationPrefsService: this.notificationPrefsService,
    };
  }
}
