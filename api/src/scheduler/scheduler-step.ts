// Один шаг тика планировщика — вынесено из SchedulerService (файл-храповик
// CLAUDE.md «Храповики»: файл на потолке, а шагов становится больше). Ошибка
// шага не блокирует остальные: у каждого свой try/catch, а итоговая строка
// `scheduler.tick` печатается всегда.
import type { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { errorMessage, errorStack } from '../common/error-info';
import type { TeacherNotifier } from '../deliveries/teacher-notifier';

/** Как шаг запускается из помощников `scheduler-*-steps.ts`: тот же `runStep`,
 * но с уже подставленными логгером и нотификатором (SchedulerService.step). */
export type StepRunner = <T>(
  name: string,
  now: DateTime,
  run: (now: DateTime) => Promise<T>,
) => Promise<T | undefined>;

interface StepDeps {
  logger: Logger;
  notifier: TeacherNotifier;
}

/** Уведомление учителю/админу в Telegram про сбой шага (CLAUDE.md «Логи»:
 * тихий отказ — самая дорогая ошибка в продукте про рассылки) — дедуп
 * «не чаще раза в 10 минут на шаг» живёт в самом notifier'е (TeacherNotifier
 * — singleton, notifySchedulerFailed сам решает, писать ли на этот раз).
 * Сбой самого уведомления — только в лог, не должен уронить тик. */
export async function runStep<T>(
  { logger, notifier }: StepDeps,
  name: string,
  now: DateTime,
  run: (now: DateTime) => Promise<T>,
): Promise<T | undefined> {
  try {
    return await run(now);
  } catch (err) {
    const message = errorMessage(err);
    logger.error(`scheduler.tick: шаг «${name}» упал: ${message}`, errorStack(err));
    await notifier.notifySchedulerFailed(name, message, now).catch((notifyErr) => {
      logger.error(
        `scheduler.tick: уведомление о сбое шага «${name}» не отправлено: ` +
          errorMessage(notifyErr),
      );
    });
    return undefined;
  }
}
