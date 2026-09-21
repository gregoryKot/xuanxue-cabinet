// Плечо ленты кабинета у уведомления «ученик прислал ссылку на видео»
// (ADR-0084) — рядом с InAppExamNotifier, но отдельным классом: тот файл уже
// за потолком в 150 строк, и храповик пускает его только вниз (CLAUDE.md
// «Храповики»), а событие здесь другое — не переход попытки в `submitted`, а
// пришедший ответ на конкретный вопрос.
//
// Своего вида уведомления не заводим: переключатель «работу сдали»
// (`attempt_submitted`) уже означает «сообщайте о приходящих работах», а
// присланная ссылка — такая же приходящая на проверку работа; получатели те
// же самые. Строка ленты у попытки при этом одна (уникальный индекс
// userId+kind+attemptId): ссылка, пришедшая после сдачи, поднимает ту же
// строку непрочитанной, а не заводит вторую — учитель видит попытку заново
// там же, где привык, см. writeNotificationRow (in-app-staff-write.ts).
//
// Best-effort: наружу не бросаем — HTTP-ответ ученику не должен падать из-за
// ленты (CLAUDE.md «Ошибки»). PII в лог не идёт: ни ссылка, ни имя.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { NotificationKind } from '@xuanxue/shared';
import { errorMessage } from '../common/error-info';
import type { VideoLinkAddedContext } from '../media/exam-media-notifier.port';
import { UsersService } from '../users/users.service';
import { staffWriteDeps, writeToStaff } from './in-app-staff-write';
import { NotificationPrefsService } from './notification-prefs.service';
import { NotificationRecord } from './notification.schema';

const ATTEMPT_SUBMITTED_KIND: NotificationKind = 'attempt_submitted';

@Injectable()
export class InAppVideoLinkNotifier {
  private readonly logger = new Logger(InAppVideoLinkNotifier.name);

  constructor(
    @InjectModel(NotificationRecord.name)
    private readonly model: Model<NotificationRecord>,
    private readonly usersService: UsersService,
    private readonly notificationPrefsService: NotificationPrefsService,
  ) {}

  /** `_now` не используется — запись несёт своё время через
   * `timestamps: true`, второго источника «сейчас» не нужно (тот же приём,
   * что у InAppExamNotifier). */
  async notifyVideoLinkAdded(
    context: VideoLinkAddedContext,
    _now: DateTime,
  ): Promise<void> {
    try {
      await writeToStaff(
        staffWriteDeps(this.usersService, this.notificationPrefsService, this.model),
        {
          kind: ATTEMPT_SUBMITTED_KIND,
          examId: context.examId,
          examTitle: context.examTitle,
          attemptId: context.attemptId,
        },
      );
    } catch (err) {
      this.logger.warn(`exam.notifyVideoLinkAdded (кабинет): ${errorMessage(err)}`, {
        attemptId: context.attemptId,
      });
    }
  }
}
