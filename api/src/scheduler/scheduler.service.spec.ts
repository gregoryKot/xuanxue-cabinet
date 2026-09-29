// Юнит-тест на фейках шагов (CLAUDE.md «Тесты»: детерминизм — без
// setTimeout-ожиданий, свой resolve() вместо реальных часов).
import { DateTime } from 'luxon';
import type { AnswerVideoSweepService } from '../answer-videos/answer-video-sweep.service';
import type { BroadcastCancelNotifyService } from '../broadcasts/broadcast-cancel-notify.service';
import type { BroadcastPlannerService } from '../broadcasts/broadcast-planner.service';
import type { PreviewService } from '../broadcasts/preview.service';
import type { DeliveryRunnerService } from '../deliveries/delivery-runner.service';
import type { ManualPromptService } from '../deliveries/manual-prompt.service';
import type { TeacherNotifier } from '../deliveries/teacher-notifier';
import type { ExamImageSweepService } from '../exam-images/exam-image-sweep.service';
import type { ExamVideoSweepService } from '../exam-videos/exam-video-sweep.service';
import type { ExamAttemptRetentionSweepService } from '../exams/exam-attempt-retention-sweep.service';
import type { ExamDeadlineCloseService } from '../exams/exam-deadline-close.service';
import type { LessonPlannerService, PlanResult } from '../lessons/lesson-planner.service';
import type { LessonReminderService } from '../lessons/lesson-reminder.service';
import type { RecordingPromptService } from '../lessons/recording-prompt.service';
import type { PaymentReminderService } from '../payments/payment-reminder.service';
import type { PaymentScreenshotSweepService } from '../payments/payment-screenshot-sweep.service';
import type { StorageOrphansService } from '../storage/storage-orphans.service';
import type { SchedulerHeartbeat } from './scheduler-heartbeat';
import { SchedulerService } from './scheduler.service';

function buildService(overrides: {
  plan?: LessonPlannerService['plan'];
  planBroadcasts?: BroadcastPlannerService['plan'];
  notifyCancelled?: BroadcastCancelNotifyService['notifyPending'];
  runDeliveries?: DeliveryRunnerService['run'];
  sendPreviews?: PreviewService['sendPending'];
  promptRecordings?: RecordingPromptService['prompt'];
  remindStudents?: LessonReminderService['remind'];
  promptManual?: ManualPromptService['prompt'];
  closeExamDeadlines?: ExamDeadlineCloseService['closeDue'];
  remindPayments?: PaymentReminderService['remind'];
  removeImageOrphans?: ExamImageSweepService['removeOrphans'];
  removeVideoOrphans?: ExamVideoSweepService['removeOrphans'];
  removeExpiredScreenshots?: PaymentScreenshotSweepService['removeExpired'];
  sweepStorageOrphans?: StorageOrphansService['sweep'];
  removeExpiredAnswerVideos?: AnswerVideoSweepService['removeExpired'];
  removeExpiredExamAttempts?: ExamAttemptRetentionSweepService['removeExpired'];
  notifySchedulerFailed?: TeacherNotifier['notifySchedulerFailed'];
}): {
  service: SchedulerService;
  // Отдельная ссылка на мок, не `notifier.notifySchedulerFailed` — иначе
  // eslint (@typescript-eslint/unbound-method) ругается на вызов метода в
  // отрыве от объекта в expect() ниже.
  notifySchedulerFailed: jest.Mock;
  // Тот же приём для heartbeat — noteTickStarted/noteTickFinished (аудит
  // 2026-09-21, MED): без отдельных ссылок unbound-method ругался бы и здесь.
  noteTickStarted: jest.Mock;
  noteTickFinished: jest.Mock;
} {
  const plan = overrides.plan ?? jest.fn().mockResolvedValue({ created: 0, removed: 0 });
  const planBroadcasts =
    overrides.planBroadcasts ?? jest.fn().mockResolvedValue({ broadcasts: 0 });
  const notifyCancelled =
    overrides.notifyCancelled ?? jest.fn().mockResolvedValue({ claimed: 0 });
  const runDeliveries =
    overrides.runDeliveries ?? jest.fn().mockResolvedValue({ sent: 0, failed: 0 });
  const sendPreviews =
    overrides.sendPreviews ?? jest.fn().mockResolvedValue({ claimed: 0 });
  const promptRecordings =
    overrides.promptRecordings ?? jest.fn().mockResolvedValue({ prompted: 0 });
  const remindStudents =
    overrides.remindStudents ?? jest.fn().mockResolvedValue({ reminded: 0 });
  const promptManual =
    overrides.promptManual ?? jest.fn().mockResolvedValue({ prompted: 0 });
  const closeExamDeadlines =
    overrides.closeExamDeadlines ?? jest.fn().mockResolvedValue({ closed: 0 });
  const remindPayments =
    overrides.remindPayments ?? jest.fn().mockResolvedValue({ reminded: 0 });
  const removeImageOrphans =
    overrides.removeImageOrphans ?? jest.fn().mockResolvedValue({ removed: 0 });
  const removeVideoOrphans =
    overrides.removeVideoOrphans ?? jest.fn().mockResolvedValue({ removed: 0 });
  const removeExpiredScreenshots =
    overrides.removeExpiredScreenshots ??
    jest.fn().mockResolvedValue({ removed: 0, orphans: 0 });
  const sweepStorageOrphans =
    overrides.sweepStorageOrphans ?? jest.fn().mockResolvedValue({ removed: 0 });
  const removeExpiredAnswerVideos =
    overrides.removeExpiredAnswerVideos ?? jest.fn().mockResolvedValue({ removed: 0 });
  const removeExpiredExamAttempts =
    overrides.removeExpiredExamAttempts ?? jest.fn().mockResolvedValue({ removed: 0 });
  const notifySchedulerFailed =
    overrides.notifySchedulerFailed ?? jest.fn().mockResolvedValue(undefined);
  const notifier: TeacherNotifier = {
    notifyDeliveryFailed: jest.fn().mockResolvedValue(undefined),
    notifySchedulerFailed,
    notifyBroadcastCancelled: jest.fn().mockResolvedValue(undefined),
  };
  const noteTickStarted = jest.fn();
  const noteTickFinished = jest.fn();
  const heartbeat = {
    noteTickStarted,
    noteTickFinished,
  } as unknown as SchedulerHeartbeat;
  const service = new SchedulerService(
    { plan } as unknown as LessonPlannerService,
    { plan: planBroadcasts } as unknown as BroadcastPlannerService,
    { notifyPending: notifyCancelled } as unknown as BroadcastCancelNotifyService,
    { run: runDeliveries } as unknown as DeliveryRunnerService,
    { sendPending: sendPreviews } as unknown as PreviewService,
    { prompt: promptRecordings } as unknown as RecordingPromptService,
    { remind: remindStudents } as unknown as LessonReminderService,
    { prompt: promptManual } as unknown as ManualPromptService,
    { closeDue: closeExamDeadlines } as unknown as ExamDeadlineCloseService,
    { remind: remindPayments } as unknown as PaymentReminderService,
    { removeOrphans: removeImageOrphans } as unknown as ExamImageSweepService,
    { removeOrphans: removeVideoOrphans } as unknown as ExamVideoSweepService,
    {
      removeExpired: removeExpiredScreenshots,
    } as unknown as PaymentScreenshotSweepService,
    { sweep: sweepStorageOrphans } as unknown as StorageOrphansService,
    { removeExpired: removeExpiredAnswerVideos } as unknown as AnswerVideoSweepService,
    {
      removeExpired: removeExpiredExamAttempts,
    } as unknown as ExamAttemptRetentionSweepService,
    notifier,
    heartbeat,
  );
  return {
    service,
    notifySchedulerFailed: notifySchedulerFailed as jest.Mock,
    noteTickStarted,
    noteTickFinished,
  };
}

describe('SchedulerService.tick', () => {
  it('зовёт все шаги с одним DateTime, не бросает', async () => {
    const plan = jest.fn((_now: DateTime): Promise<PlanResult> =>
      Promise.resolve({ created: 2, removed: 1 }),
    );
    const planBroadcasts = jest.fn(
      (_now: DateTime): ReturnType<BroadcastPlannerService['plan']> =>
        Promise.resolve({ broadcasts: 3 }),
    );
    const notifyCancelled = jest.fn(
      (_now: DateTime): ReturnType<BroadcastCancelNotifyService['notifyPending']> =>
        Promise.resolve({ claimed: 1 }),
    );
    const runDeliveries = jest.fn(
      (_now: DateTime): ReturnType<DeliveryRunnerService['run']> =>
        Promise.resolve({ sent: 4, failed: 1 }),
    );
    const sendPreviews = jest.fn(
      (_now: DateTime): ReturnType<PreviewService['sendPending']> =>
        Promise.resolve({ claimed: 2 }),
    );
    const promptRecordings = jest.fn(
      (_now: DateTime): ReturnType<RecordingPromptService['prompt']> =>
        Promise.resolve({ prompted: 1 }),
    );
    const remindStudents = jest.fn(
      (_now: DateTime): ReturnType<LessonReminderService['remind']> =>
        Promise.resolve({ reminded: 1 }),
    );
    const promptManual = jest.fn(
      (_now: DateTime): ReturnType<ManualPromptService['prompt']> =>
        Promise.resolve({ prompted: 1 }),
    );
    const closeExamDeadlines = jest.fn(
      (_now: DateTime): ReturnType<ExamDeadlineCloseService['closeDue']> =>
        Promise.resolve({ closed: 1 }),
    );
    const remindPayments = jest.fn(
      (_now: DateTime): ReturnType<PaymentReminderService['remind']> =>
        Promise.resolve({ reminded: 2 }),
    );
    const removeImageOrphans = jest.fn(
      (_now: DateTime): ReturnType<ExamImageSweepService['removeOrphans']> =>
        Promise.resolve({ removed: 1 }),
    );
    const removeExpiredScreenshots = jest.fn(
      (_now: DateTime): ReturnType<PaymentScreenshotSweepService['removeExpired']> =>
        Promise.resolve({ removed: 1, orphans: 0 }),
    );
    const removeExpiredExamAttempts = jest.fn(
      (_now: DateTime): ReturnType<ExamAttemptRetentionSweepService['removeExpired']> =>
        Promise.resolve({ removed: 2 }),
    );
    const { service } = buildService({
      plan,
      planBroadcasts,
      notifyCancelled,
      runDeliveries,
      sendPreviews,
      promptRecordings,
      remindStudents,
      promptManual,
      closeExamDeadlines,
      remindPayments,
      removeImageOrphans,
      removeExpiredScreenshots,
      removeExpiredExamAttempts,
    });

    await expect(service.tick()).resolves.toBeUndefined();

    expect(plan).toHaveBeenCalledTimes(1);
    expect(planBroadcasts).toHaveBeenCalledTimes(1);
    expect(notifyCancelled).toHaveBeenCalledTimes(1);
    expect(runDeliveries).toHaveBeenCalledTimes(1);
    expect(sendPreviews).toHaveBeenCalledTimes(1);
    expect(promptRecordings).toHaveBeenCalledTimes(1);
    expect(remindStudents).toHaveBeenCalledTimes(1);
    expect(promptManual).toHaveBeenCalledTimes(1);
    expect(closeExamDeadlines).toHaveBeenCalledTimes(1);
    expect(remindPayments).toHaveBeenCalledTimes(1);
    expect(removeImageOrphans).toHaveBeenCalledTimes(1);
    expect(removeExpiredScreenshots).toHaveBeenCalledTimes(1);
    expect(removeExpiredExamAttempts).toHaveBeenCalledTimes(1);
    const [calledWith] = plan.mock.calls[0] ?? [];
    expect(calledWith).toBeInstanceOf(DateTime);
    // Все шаги делят один now — рассылка не может считать «позже», чем видел
    // планировщик занятий в этом же тике.
    expect(planBroadcasts.mock.calls[0]?.[0]).toBe(calledWith);
    expect(notifyCancelled.mock.calls[0]?.[0]).toBe(calledWith);
    expect(runDeliveries.mock.calls[0]?.[0]).toBe(calledWith);
    expect(sendPreviews.mock.calls[0]?.[0]).toBe(calledWith);
    expect(promptRecordings.mock.calls[0]?.[0]).toBe(calledWith);
    expect(remindStudents.mock.calls[0]?.[0]).toBe(calledWith);
    expect(promptManual.mock.calls[0]?.[0]).toBe(calledWith);
    expect(closeExamDeadlines.mock.calls[0]?.[0]).toBe(calledWith);
    expect(remindPayments.mock.calls[0]?.[0]).toBe(calledWith);
    expect(removeImageOrphans.mock.calls[0]?.[0]).toBe(calledWith);
    expect(removeExpiredScreenshots.mock.calls[0]?.[0]).toBe(calledWith);
  });

  it('ошибка шага «напоминание ученикам» не останавливает шаг ручных каналов', async () => {
    const remindStudents = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const promptManual = jest.fn().mockResolvedValue({ prompted: 0 });
    const { service } = buildService({ remindStudents, promptManual });

    await expect(service.tick()).resolves.toBeUndefined();
    expect(promptManual).toHaveBeenCalledTimes(1);
  });

  it('ошибка шага «напоминания об оплате» не блокирует соседей и сообщает о себе', async () => {
    const remindPayments = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const closeExamDeadlines = jest.fn().mockResolvedValue({ closed: 0 });
    const removeImageOrphans = jest.fn().mockResolvedValue({ removed: 0 });
    const { service, notifySchedulerFailed } = buildService({
      remindPayments,
      closeExamDeadlines,
      removeImageOrphans,
    });

    await expect(service.tick()).resolves.toBeUndefined();

    expect(closeExamDeadlines).toHaveBeenCalledTimes(1);
    expect(removeImageOrphans).toHaveBeenCalledTimes(1);
    expect(notifySchedulerFailed).toHaveBeenCalledWith(
      'напоминания об оплате',
      'mongo упал',
      expect.any(DateTime),
    );
  });

  it('шаги до «напоминаний об оплате» падают — он всё равно идёт', async () => {
    const closeExamDeadlines = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const remindPayments = jest.fn().mockResolvedValue({ reminded: 0 });
    const { service } = buildService({ closeExamDeadlines, remindPayments });

    await expect(service.tick()).resolves.toBeUndefined();

    expect(remindPayments).toHaveBeenCalledTimes(1);
  });

  it('ошибка шага отмен не останавливает шаг доставок', async () => {
    const notifyCancelled = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const runDeliveries = jest.fn().mockResolvedValue({ sent: 0, failed: 0 });
    const { service } = buildService({ notifyCancelled, runDeliveries });

    await expect(service.tick()).resolves.toBeUndefined();
    expect(runDeliveries).toHaveBeenCalledTimes(1);
  });

  it('ошибка шага рассылок не останавливает шаг доставок и предпросмотра', async () => {
    const planBroadcasts = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const runDeliveries = jest.fn().mockResolvedValue({ sent: 0, failed: 0 });
    const sendPreviews = jest.fn().mockResolvedValue({ claimed: 0 });
    const { service } = buildService({ planBroadcasts, runDeliveries, sendPreviews });

    await expect(service.tick()).resolves.toBeUndefined();
    expect(runDeliveries).toHaveBeenCalledTimes(1);
    expect(sendPreviews).toHaveBeenCalledTimes(1);
  });

  it('ошибка шага занятий не останавливает остальные шаги', async () => {
    const plan = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const planBroadcasts = jest.fn().mockResolvedValue({ broadcasts: 0 });
    const runDeliveries = jest.fn().mockResolvedValue({ sent: 0, failed: 0 });
    const { service } = buildService({ plan, planBroadcasts, runDeliveries });

    await expect(service.tick()).resolves.toBeUndefined();
    expect(planBroadcasts).toHaveBeenCalledTimes(1);
    expect(runDeliveries).toHaveBeenCalledTimes(1);
  });

  it('ошибка шага предпросмотра не мешает итоговому логу', async () => {
    const sendPreviews = jest.fn().mockRejectedValue(new Error('бот молчит'));
    const { service } = buildService({ sendPreviews });

    await expect(service.tick()).resolves.toBeUndefined();
  });

  it('ошибка шага доставок не мешает итоговому логу', async () => {
    const runDeliveries = jest.fn().mockRejectedValue(new Error('канал упал'));
    const { service } = buildService({ runDeliveries });

    await expect(service.tick()).resolves.toBeUndefined();
  });

  it('ошибка шага «запись» не останавливает шаг ручных каналов', async () => {
    const promptRecordings = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const promptManual = jest.fn().mockResolvedValue({ prompted: 0 });
    const { service } = buildService({ promptRecordings, promptManual });

    await expect(service.tick()).resolves.toBeUndefined();
    expect(promptManual).toHaveBeenCalledTimes(1);
  });

  it('ошибка шага ручных каналов не мешает итоговому логу', async () => {
    const promptManual = jest.fn().mockRejectedValue(new Error('бот молчит'));
    const { service } = buildService({ promptManual });

    await expect(service.tick()).resolves.toBeUndefined();
  });

  // Блокер аудита 2026-09-15 (ТЗ 4.4, п.7): этот шаг — единственный способ
  // закрыть попытку ученика, который не вернулся в кабинет, и он не должен
  // зависеть от исхода остальных шагов тика.
  it('ошибка шага «дедлайны экзаменов» не мешает итоговому логу', async () => {
    const closeExamDeadlines = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const { service } = buildService({ closeExamDeadlines });

    await expect(service.tick()).resolves.toBeUndefined();
  });

  it('ошибка шага «картинки-сироты» не мешает итоговому логу', async () => {
    const removeImageOrphans = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const { service } = buildService({ removeImageOrphans });

    await expect(service.tick()).resolves.toBeUndefined();
  });

  // ADR-0050: последний шаг тика — упасть он может как и любой другой, не
  // должен уронить итоговый лог тика.
  it('ошибка шага «скриншоты оплат» не мешает итоговому логу', async () => {
    const removeExpiredScreenshots = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const { service } = buildService({ removeExpiredScreenshots });

    await expect(service.tick()).resolves.toBeUndefined();
  });

  it('ошибка шага «видео-сироты» не мешает итоговому логу', async () => {
    const removeVideoOrphans = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const { service } = buildService({ removeVideoOrphans });

    await expect(service.tick()).resolves.toBeUndefined();
  });

  it('ошибка шага «файлы-сироты» не мешает итоговому логу', async () => {
    const sweepStorageOrphans = jest.fn().mockRejectedValue(new Error('R2 недоступен'));
    const { service } = buildService({ sweepStorageOrphans });

    await expect(service.tick()).resolves.toBeUndefined();
  });

  // ADR-0137: шаг видео-ответа падает как любой другой, не должен уронить тик.
  it('ошибка шага «видео-ответы» не мешает итоговому логу', async () => {
    const removeExpiredAnswerVideos = jest
      .fn()
      .mockRejectedValue(new Error('mongo упал'));
    const { service } = buildService({ removeExpiredAnswerVideos });

    await expect(service.tick()).resolves.toBeUndefined();
  });

  // ADR-0153: шаг срока хранения падает как любой другой — тик не рвётся, а
  // админ узнаёт по имени шага, что попытки не убираются (тихий отказ дороже всего).
  it('ошибка шага «срок хранения попыток» не мешает тику и доходит до уведомления', async () => {
    const removeExpiredExamAttempts = jest
      .fn()
      .mockRejectedValue(new Error('mongo упал'));
    const { service, notifySchedulerFailed } = buildService({
      removeExpiredExamAttempts,
    });

    await expect(service.tick()).resolves.toBeUndefined();

    expect(notifySchedulerFailed).toHaveBeenCalledWith(
      'срок хранения попыток',
      'mongo упал',
      expect.any(DateTime),
    );
  });

  it('упавший шаг зовёт notifySchedulerFailed с именем шага и текстом ошибки', async () => {
    const runDeliveries = jest.fn().mockRejectedValue(new Error('канал упал'));
    const { service, notifySchedulerFailed } = buildService({ runDeliveries });

    await service.tick();

    expect(notifySchedulerFailed).toHaveBeenCalledWith(
      'доставки',
      'канал упал',
      expect.any(DateTime),
    );
  });

  it('упавшее уведомление о сбое шага не роняет тик', async () => {
    const runDeliveries = jest.fn().mockRejectedValue(new Error('канал упал'));
    const failingNotify: TeacherNotifier['notifySchedulerFailed'] = jest
      .fn()
      .mockRejectedValue(new Error('бот молчит'));
    const { service } = buildService({
      runDeliveries,
      notifySchedulerFailed: failingNotify,
    });

    await expect(service.tick()).resolves.toBeUndefined();
  });

  it('успешный тик не зовёт notifySchedulerFailed', async () => {
    const { service, notifySchedulerFailed } = buildService({});

    await service.tick();

    expect(notifySchedulerFailed).not.toHaveBeenCalled();
  });

  // Аудит 2026-09-21 (MED, RUNBOOK §8 п.4): heartbeat — единственный сигнал
  // /api/health о том, что тик жив, а не завис без таймаута.
  it('успешный тик отмечает и начало, и конец heartbeat', async () => {
    const { service, noteTickStarted, noteTickFinished } = buildService({});

    await service.tick();

    expect(noteTickStarted).toHaveBeenCalledTimes(1);
    expect(noteTickFinished).toHaveBeenCalledTimes(1);
  });

  it('упавший внутри шаг всё равно доходит до noteTickFinished', async () => {
    const runDeliveries = jest.fn().mockRejectedValue(new Error('канал упал'));
    const { service, noteTickStarted, noteTickFinished } = buildService({
      runDeliveries,
    });

    await service.tick();

    expect(noteTickStarted).toHaveBeenCalledTimes(1);
    expect(noteTickFinished).toHaveBeenCalledTimes(1);
  });

  // Каждый шаг ловит свою ошибку сам (this.step) — runTick() в норме не
  // бросает. Этот тест бьёт по самому finally в tick(): даже исключение мимо
  // this.step() обязано дойти до noteTickFinished, не оставив heartbeat с
  // тиком навечно «в полёте».
  it('исключение мимо this.step() всё равно доходит до noteTickFinished (finally)', async () => {
    const { service, noteTickStarted, noteTickFinished } = buildService({});
    const withRunTick = service as unknown as { runTick(): Promise<void> };
    jest.spyOn(withRunTick, 'runTick').mockRejectedValue(new Error('сбой мимо step()'));

    await expect(service.tick()).rejects.toThrow('сбой мимо step()');

    expect(noteTickStarted).toHaveBeenCalledTimes(1);
    expect(noteTickFinished).toHaveBeenCalledTimes(1);
  });

  it('onApplicationShutdown ждёт тик в полёте (SIGTERM: тик завершается, не обрывается)', async () => {
    let resolvePlan!: (value: PlanResult) => void;
    const deferred = new Promise<PlanResult>((resolve) => {
      resolvePlan = resolve;
    });
    const plan = jest.fn().mockReturnValue(deferred);
    const { service } = buildService({ plan });

    const tickPromise = service.tick();
    let shutdownDone = false;
    const shutdownPromise = service.onApplicationShutdown().then(() => {
      shutdownDone = true;
    });

    // Тик ещё не завершился — shutdown не должен резолвиться раньше него.
    await Promise.resolve();
    await Promise.resolve();
    expect(shutdownDone).toBe(false);

    resolvePlan({ created: 0, removed: 0 });
    await shutdownPromise;
    expect(shutdownDone).toBe(true);
    await tickPromise;
  });

  it('onApplicationShutdown без тика в полёте резолвится сразу', async () => {
    const { service } = buildService({});
    await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
  });
});
