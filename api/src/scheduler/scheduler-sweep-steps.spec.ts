// Шаги уборки тика на фейках (CLAUDE.md «Тесты»: детерминизм, без Mongo — сами
// уборщики проверены своими спеками против настоящей Mongo). Здесь — что тик
// вообще зовёт каждого из них и сообщает итог в строке `scheduler.tick`: срок
// хранения без вызова из тика — обещание без исполнителя (ADR-0153, правило 1д).
import { DateTime } from 'luxon';
import {
  formatSweepResults,
  runSweepSteps,
  type SweepStepRunners,
} from './scheduler-sweep-steps';

const NOW = DateTime.utc(2026, 9, 29, 12, 0, 0);

const EXPECTED_STEP_NAMES = [
  'картинки-сироты',
  'видео-сироты',
  'скриншоты оплат',
  'файлы-сироты',
  'видео-ответы',
  'срок хранения попыток',
];

function fakeRunners(): { [K in keyof SweepStepRunners]: jest.Mock } {
  return {
    removeImageOrphans: jest.fn().mockResolvedValue({ removed: 1 }),
    removeVideoOrphans: jest.fn().mockResolvedValue({ removed: 2 }),
    removeExpiredScreenshots: jest.fn().mockResolvedValue({ removed: 3, orphans: 4 }),
    sweepStorageOrphans: jest.fn().mockResolvedValue({ removed: 5 }),
    removeExpiredAnswerVideos: jest.fn().mockResolvedValue({ removed: 6 }),
    removeExpiredExamAttempts: jest.fn().mockResolvedValue({ removed: 7 }),
  };
}

describe('runSweepSteps', () => {
  it('зовёт каждый шаг один раз под своим именем и собирает итоги', async () => {
    const names: string[] = [];
    const runners = fakeRunners();

    const results = await runSweepSteps(
      <T>(name: string, now: DateTime, run: (n: DateTime) => Promise<T>) => {
        names.push(name);
        return run(now);
      },
      NOW,
      runners,
    );

    expect(names).toEqual(EXPECTED_STEP_NAMES);
    for (const runner of Object.values(runners)) {
      expect(runner).toHaveBeenCalledTimes(1);
      expect(runner).toHaveBeenCalledWith(NOW);
    }
    expect(results).toEqual({
      imagesRemoved: 1,
      videosRemoved: 2,
      screenshotsRemoved: 3,
      screenshotOrphans: 4,
      filesRemoved: 5,
      answerVideosRemoved: 6,
      examAttemptsPurged: 7,
    });
  });

  it('упавший шаг (обёртка вернула undefined) даёт нули, остальные шаги идут', async () => {
    const runners = fakeRunners();

    const results = await runSweepSteps(
      <T>(name: string, now: DateTime, run: (n: DateTime) => Promise<T>) =>
        name === 'срок хранения попыток' ? Promise.resolve(undefined) : run(now),
      NOW,
      runners,
    );

    expect(results.examAttemptsPurged).toBe(0);
    expect(results.answerVideosRemoved).toBe(6);
  });
});

describe('formatSweepResults', () => {
  it('называет каждое число в хвосте строки scheduler.tick', () => {
    expect(
      formatSweepResults({
        imagesRemoved: 1,
        videosRemoved: 2,
        screenshotsRemoved: 3,
        screenshotOrphans: 4,
        filesRemoved: 5,
        answerVideosRemoved: 6,
        examAttemptsPurged: 7,
      }),
    ).toBe(
      'imagesRemoved=1 videosRemoved=2 paymentScreenshotsRemoved=3 ' +
        'paymentScreenshotOrphans=4 filesRemoved=5 answerVideosRemoved=6 ' +
        'examAttemptsPurged=7',
    );
  });
});
