// Шесть шагов уборки байтов-сирот и данных по сроку хранения — вынесены из
// SchedulerService.runTick (файл-храповик CLAUDE.md «Храповики»: файл уже
// был на потолке в 168 строк, «может только уменьшаться»). Каждый шаг
// оборачивается тем же `step()` (лог сбоя + notifySchedulerFailed), что и
// остальные шаги тика — вызывающий передаёт его как аргумент, метод
// приватный у SchedulerService.
import type { DateTime } from 'luxon';

type StepRunner = <T>(
  name: string,
  now: DateTime,
  run: (now: DateTime) => Promise<T>,
) => Promise<T | undefined>;

export interface SweepStepRunners {
  removeImageOrphans: (now: DateTime) => Promise<{ removed: number }>;
  removeVideoOrphans: (now: DateTime) => Promise<{ removed: number }>;
  removeExpiredScreenshots: (
    now: DateTime,
  ) => Promise<{ removed: number; orphans: number }>;
  sweepStorageOrphans: (now: DateTime) => Promise<{ removed: number }>;
  // ADR-0137 — видео-ответ ученика: брошенные загрузки, файлы без ссылки и
  // файлы по сроку хранения, одним шагом (AnswerVideoSweepService).
  removeExpiredAnswerVideos: (now: DateTime) => Promise<{ removed: number }>;
  // ADR-0153 — попытка экзамена по сроку хранения (3 года после результата)
  // вместе с оценкой, видео и уведомлениями (ExamAttemptRetentionSweepService).
  removeExpiredExamAttempts: (now: DateTime) => Promise<{ removed: number }>;
}

export interface SweepStepResults {
  imagesRemoved: number;
  videosRemoved: number;
  screenshotsRemoved: number;
  screenshotOrphans: number;
  filesRemoved: number;
  answerVideosRemoved: number;
  examAttemptsPurged: number;
}

/** Хвост строки `scheduler.tick` с итогами уборки — здесь, а не в
 * SchedulerService: файл тика на потолке храповика, а шагов становится больше. */
export function formatSweepResults(r: SweepStepResults): string {
  return (
    `imagesRemoved=${r.imagesRemoved} videosRemoved=${r.videosRemoved} ` +
    `paymentScreenshotsRemoved=${r.screenshotsRemoved} ` +
    `paymentScreenshotOrphans=${r.screenshotOrphans} filesRemoved=${r.filesRemoved} ` +
    `answerVideosRemoved=${r.answerVideosRemoved} examAttemptsPurged=${r.examAttemptsPurged}`
  );
}

export async function runSweepSteps(
  step: StepRunner,
  now: DateTime,
  runners: SweepStepRunners,
): Promise<SweepStepResults> {
  // ADR-0035/ADR-0133: картинка/видео вопроса живёт, пока на них ссылается
  // вопрос банка или снимок попытки — сирота старше суток убирается сама.
  const { removed: imagesRemoved } = (await step(
    'картинки-сироты',
    now,
    runners.removeImageOrphans,
  )) ?? {
    removed: 0,
  };
  const { removed: videosRemoved } = (await step(
    'видео-сироты',
    now,
    runners.removeVideoOrphans,
  )) ?? {
    removed: 0,
  };
  // ADR-0050: снимок перевода живёт 30 дней после подтверждения и 90 дней без него.
  const { removed: screenshotsRemoved, orphans: screenshotOrphans } = (await step(
    'скриншоты оплат',
    now,
    runners.removeExpiredScreenshots,
  )) ?? { removed: 0, orphans: 0 };
  // ADR-0079: объект в R2, на который не сослался материал, уходит суткой позже.
  const { removed: filesRemoved } = (await step(
    'файлы-сироты',
    now,
    runners.sweepStorageOrphans,
  )) ?? {
    removed: 0,
  };
  // ADR-0137: видео-ответ — брошенная загрузка старше недели, файл без
  // ссылки старше суток или файл по сроку хранения (90 дней после проверки,
  // год без неё).
  const { removed: answerVideosRemoved } = (await step(
    'видео-ответы',
    now,
    runners.removeExpiredAnswerVideos,
  )) ?? { removed: 0 };
  // ADR-0153: попытка, чей результат старше EXAM_ATTEMPT_RETENTION_YEARS (3 лет).
  const { removed: examAttemptsPurged } = (await step(
    'срок хранения попыток',
    now,
    runners.removeExpiredExamAttempts,
  )) ?? { removed: 0 };

  return {
    imagesRemoved,
    videosRemoved,
    screenshotsRemoved,
    screenshotOrphans,
    filesRemoved,
    answerVideosRemoved,
    examAttemptsPurged,
  };
}
