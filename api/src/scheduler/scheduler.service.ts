// Единственная точка входа планировщика: здесь и только здесь строка
// `scheduler.tick`, которую ждёт RUNBOOK §2 п.4. Шаги идут последовательно в
// одном тике: рассылка не может появиться раньше своего занятия, доставка —
// раньше рассылки, предпросмотр — раньше самой рассылки. Ошибка одного шага
// не блокирует остальные — у каждого свой try/catch, итоговая строка лога
// печатается всегда, с нулями там, где шаг упал.
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { AnswerVideoSweepService } from '../answer-videos/answer-video-sweep.service';
import { BroadcastCancelNotifyService } from '../broadcasts/broadcast-cancel-notify.service';
import { BroadcastPlannerService } from '../broadcasts/broadcast-planner.service';
import { PreviewService } from '../broadcasts/preview.service';
import { DeliveryRunnerService } from '../deliveries/delivery-runner.service';
import { ManualPromptService } from '../deliveries/manual-prompt.service';
import { TEACHER_NOTIFIER, type TeacherNotifier } from '../deliveries/teacher-notifier';
import { ExamImageSweepService } from '../exam-images/exam-image-sweep.service';
import { ExamVideoSweepService } from '../exam-videos/exam-video-sweep.service';
import { ExamAttemptRetentionSweepService } from '../exams/exam-attempt-retention-sweep.service';
import { ExamDeadlineCloseService } from '../exams/exam-deadline-close.service';
import { LessonPlannerService } from '../lessons/lesson-planner.service';
import { LessonReminderService } from '../lessons/lesson-reminder.service';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { RecordingPromptService } from '../lessons/recording-prompt.service';
import { PaymentReminderService } from '../payments/payment-reminder.service';
import { PaymentScreenshotSweepService } from '../payments/payment-screenshot-sweep.service';
import { SchedulerHeartbeat } from './scheduler-heartbeat';
import { runStep } from './scheduler-step';
import { formatSweepResults, runSweepSteps } from './scheduler-sweep-steps';

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
    private readonly paymentReminderService: PaymentReminderService,
    private readonly examImageSweepService: ExamImageSweepService,
    private readonly examVideoSweepService: ExamVideoSweepService,
    private readonly paymentScreenshotSweepService: PaymentScreenshotSweepService,
    private readonly storageOrphansService: StorageOrphansService,
    private readonly answerVideoSweepService: AnswerVideoSweepService,
    private readonly examAttemptRetentionSweep: ExamAttemptRetentionSweepService,
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
    // ADR-0150: вне окна суток после назначенного школой момента шаг ничего
    // не делает; внутри — личное сообщение или строка ленты каждому, у кого
    // месяц не оплачен.
    const { reminded: paymentReminders } = (await this.step(
      'напоминания об оплате',
      now,
      (n) => this.paymentReminderService.remind(n),
    )) ?? { reminded: 0 };
    // Шесть шагов уборки байтов и данных по сроку — scheduler-sweep-steps.ts
    // (файл-храповик: этот файл уже был на потолке, «может только уменьшаться»).
    const sweep = await runSweepSteps((name, n, run) => this.step(name, n, run), now, {
      removeImageOrphans: (n) => this.examImageSweepService.removeOrphans(n),
      removeVideoOrphans: (n) => this.examVideoSweepService.removeOrphans(n),
      removeExpiredScreenshots: (n) =>
        this.paymentScreenshotSweepService.removeExpired(n),
      sweepStorageOrphans: (n) => this.storageOrphansService.sweep(n),
      removeExpiredAnswerVideos: (n) => this.answerVideoSweepService.removeExpired(n),
      removeExpiredExamAttempts: (n) => this.examAttemptRetentionSweep.removeExpired(n),
    });

    this.logger.log(
      `scheduler.tick created=${created} removed=${removed} broadcasts=${broadcasts} ` +
        `cancelNotified=${cancelNotified} sent=${sent} failed=${failed} ` +
        `previews=${previewsClaimed} recordingPrompts=${recordingsPrompted} reminded=${reminded} ` +
        `manualPrompts=${manualPrompted} examAttemptsClosed=${examAttemptsClosed} ` +
        `paymentReminders=${paymentReminders} ${formatSweepResults(sweep)}`,
    );
  }

  // Тело шага (try/catch, лог, уведомление о сбое) — scheduler-step.ts: файл
  // на потолке храповика, а тик растёт шагами.
  private step<T>(
    name: string,
    now: DateTime,
    run: (now: DateTime) => Promise<T>,
  ): Promise<T | undefined> {
    return runStep({ logger: this.logger, notifier: this.notifier }, name, now, run);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.inFlight) await this.inFlight;
  }
}
