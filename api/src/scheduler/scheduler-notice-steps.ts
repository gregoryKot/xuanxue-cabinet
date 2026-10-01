// Четыре шага тика, которые пишут ученикам в ленту и push: напоминание о занятии
// (ADR-0135), отмена занятия, запись занятия и новый материал (все три — ADR-0162).
// Вынесены из SchedulerService.runTick, как шаги уборки (scheduler-sweep-steps.ts):
// файл тика стоит на потолке храповика размера, а шагов этого семейства становится
// больше. Порядок тот же, что был в `runTick`, и у каждого шага свой try/catch
// (`step()`: лог сбоя и уведомление админу) — упавший остальных не блокирует.
import type { DateTime } from 'luxon';
import type { StepRunner } from './scheduler-step';

export interface NoticeStepRunners {
  remind: (now: DateTime) => Promise<{ reminded: number }>;
  announceCancelled: (now: DateTime) => Promise<{ notified: number }>;
  announceRecordings: (now: DateTime) => Promise<{ notified: number }>;
  announceMaterials: (now: DateTime) => Promise<{ notified: number }>;
}

export interface NoticeStepResults {
  reminded: number;
  cancelNotices: number;
  recordingNotices: number;
  materialNotices: number;
}

/** Кусок строки `scheduler.tick` с итогами шагов «ученикам» — те же ключи, что
 * были в строке до выноса (RUNBOOK §2 п.4 ищет строку целиком). */
export function formatNoticeResults(r: NoticeStepResults): string {
  return (
    `reminded=${r.reminded} cancelNotices=${r.cancelNotices} ` +
    `recordingNotices=${r.recordingNotices} materialNotices=${r.materialNotices}`
  );
}

export async function runNoticeSteps(
  step: StepRunner,
  now: DateTime,
  runners: NoticeStepRunners,
): Promise<NoticeStepResults> {
  const { reminded } = (await step('напоминание', now, runners.remind)) ?? {
    reminded: 0,
  };
  const { notified: cancelNotices } = (await step(
    'отмена ученикам',
    now,
    runners.announceCancelled,
  )) ?? { notified: 0 };
  const { notified: recordingNotices } = (await step(
    'запись ученикам',
    now,
    runners.announceRecordings,
  )) ?? { notified: 0 };
  const { notified: materialNotices } = (await step(
    'материал ученикам',
    now,
    runners.announceMaterials,
  )) ?? { notified: 0 };
  return { reminded, cancelNotices, recordingNotices, materialNotices };
}
