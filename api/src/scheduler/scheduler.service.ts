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
import { AnswerVideoSweepService } from '../answer-videos/answer-video-sweep.service';
import { BroadcastCancelNotifyService } from '../broadcasts/broadcast-cancel-notify.service';
import { BroadcastPlannerService } from '../broadcasts/broadcast-planner.service';
import { PreviewService } from '../broadcasts/preview.service';
import { DeliveryRunnerService } from '../deliveries/delivery-runner.service';
import { ManualPromptService } from '../deliveries/manual-prompt.service';
import { TEACHER_NOTIFIER, type TeacherNotifier } from '../deliveries/teacher-notifier';
import { ExamImageSweepService } from '../exam-images/exam-image-sweep.service';
import { ExamVideoSweepService } from '../exam-videos/exam-video-sweep.service';
import { ExamDeadlineCloseService } from '../exams/exam-deadline-close.service';
import { LessonPlannerService } from '../lessons/lesson-planner.service';
import { LessonReminderService } from '../lessons/lesson-reminder.service';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { RecordingPromptService } from '../lessons/recording-prompt.service';
import { PaymentScreenshotSweepService } from '../payments/payment-screenshot-sweep.service';
import { SchedulerHeartbeat } from './scheduler-heartbeat';
import { runSweepSteps } from './scheduler-sweep-steps';

@Injectable()
export class SchedulerService implements OnApplicationShutdown {
  private readonly logger = new Logger(SchedulerService.name);
  // Тик в полёте — SIGTERM (onApplicationShutdown) ждёт его, не обрывает
  // (CLAUDE.md «Деплой»).
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly plannerService: LessonPlannerService,
    private readonly broadcastPlanner: BroadcastPlannerService,
    private readonly broadcastCancelNotify: BroadcastCancelNotifyService,
    private readonly deliveryRunner: DeliveryRunnerService,
    private readonly previewService: PreviewService,
    private readonly recordingPromptService: RecordingPromptService,
    private readonly lessonReminderService: LessonReminderService,
    private readonly manualPromptService: ManualPromptService,
    private readonly examDeadlineCloseService: ExamDeadlineCloseService,
    private readonly examImageSweepService: ExamImageSweepService,
    private readonly examVideoSweepService: ExamVideoSweepService,
    private readonly paymentScreenshotSweepService: PaymentScreenshotSweepService,
    private readonly storageOrphansService: StorageOrphansService,
    private readonly answerVideoSweepService: AnswerVideoSweepService,
    @Inject(TEACHER_NOTIFIER) private readonly notifier: TeacherNotifier,
    private readonly heartbeat: SchedulerHeartbeat,
  ) {}

  // waitForCompletion: пропущенный запуск не вызывает код вовсе, свой warn
  // не нужен. heartbeat (аудит 2026-09-21, MED, RUNBOOK §8 п.4) — начало до
  // runTick(), конец в finally, чтобы отметиться и при падении шага.
  @Cron(CronExpression.EVERY_MINUTE, { waitForCompletion: true })
  async tick(): Promise<void> {
    this.heartbeat.noteTickStarted(DateTime.utc());
    const run = this.runTick();
    this.inFlight = run;
    try {
      await run;
    } finally {
      this.inFlight = null;
      this.heartbeat.noteTickFinished(DateTime.utc());
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
    const { reminded } = (await this.step('напоминание', now, (n) =>
      this.lessonReminderService.remind(n),
    )) ?? { reminded: 0 };
    const { prompted: manualPrompted } = (await this.step('ручные каналы', now, (n) =>
      this.manualPromptService.prompt(n),
    )) ?? { prompted: 0 };
    // Блокер аудита 2026-09-15 (ТЗ 4.4, п.7): без шага просроченная попытка
    // не закрывалась бы, если ученик не вернулся (exam-deadline-close.service.ts).
    const { closed: examAttemptsClosed } = (await this.step(
      'дедлайны экзаменов',
      now,
      (n) => this.examDeadlineCloseService.closeDue(n),
    )) ?? { closed: 0 };
    // Пять шагов уборки байтов — scheduler-sweep-steps.ts (файл-храповик:
    // этот файл уже был на потолке, «может только уменьшаться»).
    const {
      imagesRemoved,
      videosRemoved,
      screenshotsRemoved,
      screenshotOrphans,
      filesRemoved,
      answerVideosRemoved,
    } = await runSweepSteps((name, n, run) => this.step(name, n, run), now, {
      removeImageOrphans: (n) => this.examImageSweepService.removeOrphans(n),
      removeVideoOrphans: (n) => this.examVideoSweepService.removeOrphans(n),
      removeExpiredScreenshots: (n) =>
        this.paymentScreenshotSweepService.removeExpired(n),
      sweepStorageOrphans: (n) => this.storageOrphansService.sweep(n),
      removeExpiredAnswerVideos: (n) => this.answerVideoSweepService.removeExpired(n),
    });

    this.logger.log(
      `scheduler.tick created=${created} removed=${removed} broadcasts=${broadcasts} ` +
        `cancelNotified=${cancelNotified} sent=${sent} failed=${failed} ` +
        `previews=${previewsClaimed} recordingPrompts=${recordingsPrompted} reminded=${reminded} ` +
        `manualPrompts=${manualPrompted} examAttemptsClosed=${examAttemptsClosed} ` +
        `imagesRemoved=${imagesRemoved} videosRemoved=${videosRemoved} ` +
        `paymentScreenshotsRemoved=${screenshotsRemoved} ` +
        `paymentScreenshotOrphans=${screenshotOrphans} filesRemoved=${filesRemoved} ` +
        `answerVideosRemoved=${answerVideosRemoved}`,
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
