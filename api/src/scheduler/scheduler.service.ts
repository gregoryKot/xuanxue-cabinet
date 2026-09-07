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
import { BroadcastPlannerService } from '../broadcasts/broadcast-planner.service';
import { PreviewService } from '../broadcasts/preview.service';
import { DeliveryRunnerService } from '../deliveries/delivery-runner.service';
import { TEACHER_NOTIFIER, type TeacherNotifier } from '../deliveries/teacher-notifier';
import { LessonPlannerService } from '../lessons/lesson-planner.service';

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
    private readonly deliveryRunner: DeliveryRunnerService,
    private readonly previewService: PreviewService,
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
    const { sent, failed } = (await this.step('доставки', now, (n) =>
      this.deliveryRunner.run(n),
    )) ?? { sent: 0, failed: 0 };
    const { claimed: previewsClaimed } = (await this.step('предпросмотр', now, (n) =>
      this.previewService.sendPending(n),
    )) ?? { claimed: 0 };

    this.logger.log(
      `scheduler.tick created=${created} removed=${removed} broadcasts=${broadcasts} ` +
        `sent=${sent} failed=${failed} previews=${previewsClaimed}`,
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
