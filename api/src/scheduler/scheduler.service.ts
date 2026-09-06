// Единственная точка входа планировщика: здесь и только здесь строка
// `scheduler.tick`, которую ждёт RUNBOOK §2 п.4. Позже сюда же встанет тик
// планировщика рассылок — один cron, один лог, один in-flight.
import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { errorMessage, errorStack } from '../common/error-info';
import { LessonPlannerService } from '../lessons/lesson-planner.service';

@Injectable()
export class SchedulerService implements OnApplicationShutdown {
  private readonly logger = new Logger(SchedulerService.name);
  // Тик в полёте — SIGTERM (onApplicationShutdown) ждёт именно его, а не
  // обрывает (CLAUDE.md «Деплой»: «тик планировщика завершается, не
  // обрывается»).
  private inFlight: Promise<void> | null = null;

  constructor(private readonly plannerService: LessonPlannerService) {}

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

  // try/catch — ради счётчиков в успешном логе и текста ошибки в
  // неуспешном; стек библиотека ScheduleExplorer уже не логирует повторно,
  // поэтому ошибка не перебрасывается наверх — тик и так последний
  // обработчик. Уведомление учителю/админу в Telegram про сбой тика встанет
  // вместе с ботом (CLAUDE.md «Логи»: тихий отказ — самая дорогая ошибка в
  // продукте про рассылки) — пока единственная страховка — этот error-лог,
  // поэтому текст в нём с контекстом, не голое сообщение исключения.
  private async runTick(): Promise<void> {
    try {
      const { created, removed } = await this.plannerService.plan(DateTime.utc());
      this.logger.log(`scheduler.tick created=${created} removed=${removed}`);
    } catch (err) {
      this.logger.error(`scheduler.tick упал: ${errorMessage(err)}`, errorStack(err));
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.inFlight) await this.inFlight;
  }
}
