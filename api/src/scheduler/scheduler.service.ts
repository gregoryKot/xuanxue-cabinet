// Единственная точка входа планировщика: здесь и только здесь строка
// `scheduler.tick`, которую ждёт RUNBOOK §2 п.4. Шаги идут последовательно в
// одном тике: рассылка не может появиться раньше своего занятия, доставка —
// раньше рассылки, предпросмотр — раньше самой рассылки. Ошибка одного шага
// не блокирует остальные — у каждого свой try/catch, итоговая строка лога
// печатается всегда, с нулями там, где шаг упал.
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { errorMessage, errorStack } from '../common/error-info';
import { BroadcastCancelNotifyService } from '../broadcasts/broadcast-cancel-notify.service';
import { BroadcastPlannerService } from '../broadcasts/broadcast-planner.service';
import { PreviewService } from '../broadcasts/preview.service';
import { DeliveryRunnerService } from '../deliveries/delivery-runner.service';
import { ManualPromptService } from '../deliveries/manual-prompt.service';
import { TEACHER_NOTIFIER, type TeacherNotifier } from '../deliveries/teacher-notifier';
import { ExamImageSweepService } from '../exam-images/exam-image-sweep.service';
import { ExamDeadlineCloseService } from '../exams/exam-deadline-close.service';
import { LessonPlannerService } from '../lessons/lesson-planner.service';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { RecordingPromptService } from '../lessons/recording-prompt.service';
import { PaymentScreenshotSweepService } from '../payments/payment-screenshot-sweep.service';

@Injectable()
export class SchedulerService implements OnApplicationShutdown {
  private readonly logger = new Logger(SchedulerService.name);
  // Тик в полёте — SIGTERM (onApplicationShutdown) ждёт именно его, а не
  // обрывает (CLAUDE.md «Деплой»: «тик планировщика завершается, не
  // обрывается»).
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly plannerService: LessonPlannerService,
    private readonly broadcastPlanner: BroadcastPlannerService,
    private readonly broadcastCancelNotify: BroadcastCancelNotifyService,
    private readonly deliveryRunner: DeliveryRunnerService,
    private readonly previewService: PreviewService,
    private readonly recordingPromptService: RecordingPromptService,
    private readonly manualPromptService: ManualPromptService,
    private readonly examDeadlineCloseService: ExamDeadlineCloseService,
    private readonly examImageSweepService: ExamImageSweepService,
    private readonly paymentScreenshotSweepService: PaymentScreenshotSweepService,
    private readonly storageOrphansService: StorageOrphansService,
    @Inject(TEACHER_NOTIFIER) private readonly notifier: TeacherNotifier,
  ) {}

  // waitForCompletion: если предыдущий тик ещё не завершился, cron пропускает
  // текущий запуск целиком — наш код в этот момент не вызывается вовсе,
  // поэтому свой warn о пропуске здесь не нужен и не может быть точным.
  @Cron(CronExpression.EVERY_MINUTE, { waitForCompletion: true })
  async tick(): Promise<void> {
    const run = this.runTick();
    this.inFlight = run;
    try {
      await run;
    } finally {
      this.inFlight = null;
    }
  }

  private async runTick(): Promise<void> {
    const now = DateTime.utc();
    const { created, removed } = (await this.step('занятия', now, (n) =>
      this.plannerService.plan(n),
    )) ?? { created: 0, removed: 0 };
    const { broadcasts } = (await this.step('рассылки', now, (n) =>
      this.broadcastPlanner.plan(n),
    )) ?? { broadcasts: 0 };
    const { claimed: cancelNotified } = (await this.step('отмены', now, (n) =>
      this.broadcastCancelNotify.notifyPending(n),
    )) ?? { claimed: 0 };
    const { sent, failed } = (await this.step('доставки', now, (n) =>
      this.deliveryRunner.run(n),
    )) ?? { sent: 0, failed: 0 };
    const { claimed: previewsClaimed } = (await this.step('предпросмотр', now, (n) =>
      this.previewService.sendPending(n),
    )) ?? { claimed: 0 };
    const { prompted: recordingsPrompted } = (await this.step('запись', now, (n) =>
      this.recordingPromptService.prompt(n),
    )) ?? { prompted: 0 };
    const { prompted: manualPrompted } = (await this.step('ручные каналы', now, (n) =>
      this.manualPromptService.prompt(n),
    )) ?? { prompted: 0 };
    // Блокер аудита 2026-09-15 (ТЗ 4.4, п.7): без этого шага просроченная
    // попытка закрывалась только тогда, когда кто-то трогал именно её, и
    // могла остаться незакрытой навсегда, если ученик не вернулся —
    // exam-deadline-close.service.ts, её комментарий-шапка.
    const { closed: examAttemptsClosed } = (await this.step(
      'дедлайны экзаменов',
      now,
      (n) => this.examDeadlineCloseService.closeDue(n),
    )) ?? { closed: 0 };
    // ADR-0035, «Последствия»: картинка варианта живёт, пока на неё ссылается
    // вопрос банка или снимок попытки — сирота старше суток убирается сама.
    const { removed: imagesRemoved } = (await this.step('картинки-сироты', now, (n) =>
      this.examImageSweepService.removeOrphans(n),
    )) ?? { removed: 0 };
    // ADR-0050: снимок перевода живёт 30 дней после подтверждения и 90 дней
    // без него — сама оплата остаётся, уходит только картинка.
    const { removed: screenshotsRemoved, orphans: screenshotOrphans } = (await this.step(
      'скриншоты оплат',
      now,
      (n) => this.paymentScreenshotSweepService.removeExpired(n),
    )) ?? { removed: 0, orphans: 0 };

    // ADR-0076: объект в R2, на который не сослался материал (упала запись,
    // не удалилось при замене), уходит суткой позже — журнал storage_orphans.
    const { removed: filesRemoved } = (await this.step('файлы-сироты', now, (n) =>
      this.storageOrphansService.sweep(n),
    )) ?? { removed: 0 };

    this.logger.log(
      `scheduler.tick created=${created} removed=${removed} broadcasts=${broadcasts} ` +
        `cancelNotified=${cancelNotified} sent=${sent} failed=${failed} ` +
        `previews=${previewsClaimed} recordingPrompts=${recordingsPrompted} ` +
        `manualPrompts=${manualPrompted} examAttemptsClosed=${examAttemptsClosed} ` +
        `imagesRemoved=${imagesRemoved} paymentScreenshotsRemoved=${screenshotsRemoved} ` +
        `paymentScreenshotOrphans=${screenshotOrphans} filesRemoved=${filesRemoved}`,
    );
  }

  /** Уведомление учителю/админу в Telegram про сбой шага (CLAUDE.md «Логи»:
   * тихий отказ — самая дорогая ошибка в продукте про рассылки) — дедуп
   * «не чаще раза в 10 минут на шаг» живёт в самом notifier'е (TeacherNotifier
   * — singleton, notifySchedulerFailed сам решает, писать ли на этот раз).
   * Сбой самого уведомления — только в лог, не должен уронить тик. */
  private async step<T>(
    name: string,
    now: DateTime,
    run: (now: DateTime) => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await run(now);
    } catch (err) {
      const message = errorMessage(err);
      this.logger.error(
        `scheduler.tick: шаг «${name}» упал: ${message}`,
        errorStack(err),
      );
      await this.notifier.notifySchedulerFailed(name, message, now).catch((notifyErr) => {
        this.logger.error(
          `scheduler.tick: уведомление о сбое шага «${name}» не отправлено: ` +
            errorMessage(notifyErr),
        );
      });
      return undefined;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.inFlight) await this.inFlight;
  }
}
