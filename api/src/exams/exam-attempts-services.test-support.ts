// Сборка сервисов ExamAttemptsService/ExamGradingsService/MediaAssetsService
// поверх готовых моделей — вынесено из exam-attempts.test-support.ts
// (файл-лимит CLAUDE.md «Храповики»): там остаётся подъём Mongo и моделей,
// здесь — их сборка в сервисы, один раз для всех спеков попыток.
import type { Model } from 'mongoose';
import type { ChannelRecord } from '../channels/channel.schema';
import { ExamImagesService } from '../exam-images/exam-images.service';
import type { ExamImageRecord } from '../exam-images/exam-image.schema';
import type { ExamVideosService } from '../exam-videos/exam-videos.service';
import { ExamMediaNotifierRegistry } from '../media/exam-media-notifier.registry';
import { ExamVideoDeliveryRegistry } from '../media/exam-video-delivery.registry';
import type { MediaAssetRecord } from '../media/media-asset.schema';
import { MediaAssetsService } from '../media/media-assets.service';
import type { NotificationPrefsRecord } from '../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import type { NotificationRecord } from '../notifications/notification.schema';
import { PersonalChats } from '../telegram/personal-chats';
import { fakeExamVideosService } from '../test-support/fake-exam-videos-service';
import { UserNamesService } from '../users/user-names.service';
import type { UserRecord } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import type { ExamAttemptRecord } from './exam-attempt.schema';
import { ExamAttemptRetryCleanupService } from './exam-attempt-retry-cleanup.service';
import { fakeExamNotifier, type FakeExamNotifier } from './exam-notifier.test-support';
import { ExamAttemptsService } from './exam-attempts.service';
import type { ExamGradingRecord } from './exam-grading.schema';
import { ExamGradingsService } from './exam-gradings.service';
import type { ExamItemRecord } from './exam-item.schema';
import { ExamItemsService } from './exam-items.service';
import type { ExamRecord } from './exam.schema';
import { ExamsService } from './exams.service';

export interface AttemptsTestModels {
  attemptModel: Model<ExamAttemptRecord>;
  examModel: Model<ExamRecord>;
  itemModel: Model<ExamItemRecord>;
  gradingModel: Model<ExamGradingRecord>;
  userModel: Model<UserRecord>;
  mediaModel: Model<MediaAssetRecord>;
  // Слой 4.2 (ADR-0035) — ExamItemsService проверяет через него существование
  // картинки варианта; спекам, которым нужна картинка в снимке попытки, тоже
  // не поднимать модель второй раз.
  imageModel: Model<ExamImageRecord>;
  // ADR-0102: PersonalChats внутри gradingsService читает их, чтобы решить
  // notifiesUserInTelegram — спекам, которым нужен настоящий Telegram-канал
  // ученика или выключенный вид уведомления, тоже не поднимать модели второй раз.
  channelModel: Model<ChannelRecord>;
  notificationPrefsModel: Model<NotificationPrefsRecord>;
  // Лента кабинета (ADR-0061) — нужна ADR-0131: повтор после просроченной
  // попытки затирает и её строки в inbox учителя (ExamAttemptRetryCleanupService).
  notificationModel: Model<NotificationRecord>;
}

export interface AttemptsTestServices {
  examsService: ExamsService;
  examItemsService: ExamItemsService;
  examImagesService: ExamImagesService;
  // Слой 4.2 (ADR-0133) — фейк (assertExist), настоящий сервис проверен
  // отдельно (exam-videos.service.spec.ts). ExamBotService нужен ради типа
  // конструктора, поведение видео в боте — юнит-тесты на fakeExamBotPort.
  examVideosService: ExamVideosService;
  userNamesService: UserNamesService;
  examNotifier: FakeExamNotifier;
  service: ExamAttemptsService;
  gradingsService: ExamGradingsService;
  // Слой 4.5 (ADR-0023) — нужен спекам про видео вопроса внутри потока
  // вопросов бота (exam-attempt-flow.spec.ts, ТЗ 4б.2 часть 2).
  mediaAssetsService: MediaAssetsService;
}

export function buildAttemptsServices(models: AttemptsTestModels): AttemptsTestServices {
  const examsService = new ExamsService(models.examModel, models.itemModel);
  const examImagesService = new ExamImagesService(models.imageModel, models.attemptModel);
  const examVideosService = fakeExamVideosService();
  const examItemsService = new ExamItemsService(
    models.itemModel,
    models.examModel,
    examImagesService,
    examVideosService,
  );
  const userNamesService = new UserNamesService(models.userModel);
  const examNotifier = fakeExamNotifier();
  // Один инстанс UsersService на MediaAssetsService и PersonalChats — тот же
  // userModel, не два разных подключения к одному и тому же (CLAUDE.md
  // «Дубли»).
  const usersService = new UsersService(models.userModel);
  const notificationPrefsService = new NotificationPrefsService(
    models.notificationPrefsModel,
  );
  const personalChats = new PersonalChats(
    usersService,
    models.channelModel,
    notificationPrefsService,
  );
  const retryCleanup = new ExamAttemptRetryCleanupService(
    models.attemptModel,
    models.mediaModel,
    models.notificationModel,
    models.gradingModel,
  );
  const service = new ExamAttemptsService(
    models.attemptModel,
    models.gradingModel,
    examsService,
    models.itemModel,
    userNamesService,
    examNotifier,
    retryCleanup,
  );
  const gradingsService = new ExamGradingsService(
    models.attemptModel,
    models.gradingModel,
    userNamesService,
    personalChats,
    examNotifier,
  );
  // Реестр нотификатора ссылок (ADR-0084) — не собран в этих спеках
  // (ExamsModule здесь не поднимается): getOrNull() вернёт null, addLink()
  // это переживает молча (ExamMediaNotifierRegistry, комментарий там же).
  const mediaAssetsService = new MediaAssetsService(
    models.mediaModel,
    models.attemptModel,
    usersService,
    new ExamMediaNotifierRegistry(),
    new ExamVideoDeliveryRegistry(),
  );
  return {
    examsService,
    examItemsService,
    examImagesService,
    examVideosService,
    userNamesService,
    examNotifier,
    service,
    gradingsService,
    mediaAssetsService,
  };
}
