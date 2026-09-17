// Один модуль на банк вопросов (`exam_items`), форму экзамена (`exams`, ТЗ
// 4.3) и попытку (`exam_attempts`, ТЗ 4.4): попытка при старте читает форму
// и вопросы через ExamsService/ExamItemsService того же модуля (проверка
// «блок ссылается на опубликованный вопрос», расшифровка снимка) — им всё
// равно нужен общий контекст DI; заводить отдельный модуль ради разделения
// добавило бы только ре-экспорт MongooseModule без другой пользы (CLAUDE.md
// «Файлы»: не создавай без нужды).
//
// Импортирует UsersModule ради UserNamesService (слой 4.6: имя ученика в
// карточке проверки и списке попыток). Цикла нет — UsersModule ничего не
// знает про exams (сверено grep'ом, ExamAttemptRecord/ExamGradingRecord
// заходят в users только как имя модели в user-data.registry.ts, не импорт).
//
// Импортирует TelegramModule ради EXAM_NOTIFIER (слой 4.7, PLAN §11) — тот
// же приём, что у TEACHER_NOTIFIER в scheduler.module.ts: реализация
// (TelegramExamNotifier) физически живёт в api/src/telegram (Telegraf вне
// telegram/channels запрещён eslint), но собирается здесь — сами
// ExamAttemptsService/ExamGradingsService/MyExamsService и так живут в этом
// модуле, отдельного «модуля-сборщика» под них, в отличие от
// scheduler-сервисов, не заводили. Цикла нет — TelegramModule и его
// собственные импорты (ChannelsModule/UsersModule/BroadcastsModule/
// LessonsModule/DeliveriesModule/ClassesModule/SettingsModule/
// NotificationsModule) про ExamsModule не знают (сверено grep'ом): порт
// ExamNotifier — единственное, что TelegramExamNotifier берёт из exams/, и
// это только тип (import type), не рантайм-зависимость модуля.
//
// Импортирует MediaModule ради MediaAssetsService (слой 4.5, ADR-0023):
// ExamAttemptsController подмешивает media в ответ (exam-attempt-media.ts).
// Цикла нет — MediaModule берёт модель ExamAttemptRecord через
// ExamAttemptModelModule (тонкая регистрация модели рядом, без контроллеров
// и сервисов этого файла), а не через ExamsModule целиком.
//
// ExamBotService (слой 4б.2, ADR-0024) — бот, второй клиент
// ExamAttemptsService/MyExamsService: в отличие от EXAM_NOTIFIER выше, для
// него нет DI в обратную сторону (TelegramModule на ExamsModule не
// импортируется — цикл), поэтому провайдер кладёт себя в
// api/src/telegram/exam-bot.port.ts сам, без записи в exports.
//
// Импортирует ExamImagesModule ради ExamImagesService (слой 4.2, ADR-0035):
// ExamItemsService проверяет через него существование картинки у варианта
// перед записью. Цикла нет — ExamImagesModule импортирует только
// ExamAttemptModelModule (тонкая регистрация модели попытки, без контроллеров
// и остального ExamsModule), про ExamsModule он не знает.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamImagesModule } from '../exam-images/exam-images.module';
import { MediaModule } from '../media/media.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TelegramExamNotifier } from '../telegram/telegram-exam-notifier';
import { UsersModule } from '../users/users.module';
import { ExamAttemptRecord, ExamAttemptSchema } from './exam-attempt.schema';
import { ExamAttemptsController } from './exam-attempts.controller';
import { ExamAttemptsService } from './exam-attempts.service';
import { ExamBotService } from './exam-bot.service';
import { EXAM_NOTIFIER } from './exam-notifier';
import { ExamGradingRecord, ExamGradingSchema } from './exam-grading.schema';
import { ExamGradingsService } from './exam-gradings.service';
import { ExamItemStatsService } from './exam-item-stats.service';
import { ExamItemRecord, ExamItemSchema } from './exam-item.schema';
import { ExamItemsController } from './exam-items.controller';
import { ExamItemsService } from './exam-items.service';
import { ExamRecord, ExamSchema } from './exam.schema';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { MyExamsController } from './my-exams.controller';
import { MyExamsService } from './my-exams.service';

@Module({
  imports: [
    UsersModule,
    TelegramModule,
    MediaModule,
    ExamImagesModule,
    MongooseModule.forFeature([
      { name: ExamItemRecord.name, schema: ExamItemSchema },
      { name: ExamRecord.name, schema: ExamSchema },
      { name: ExamAttemptRecord.name, schema: ExamAttemptSchema },
      { name: ExamGradingRecord.name, schema: ExamGradingSchema },
    ]),
  ],
  controllers: [
    ExamItemsController,
    ExamsController,
    ExamAttemptsController,
    MyExamsController,
  ],
  providers: [
    ExamItemsService,
    ExamItemStatsService,
    ExamsService,
    ExamAttemptsService,
    ExamGradingsService,
    MyExamsService,
    { provide: EXAM_NOTIFIER, useClass: TelegramExamNotifier },
    // Бот — второй клиент этих же сервисов (ADR-0024, слой 4б.2): кладёт
    // себя в ExamBotPort сама в конструкторе, комментарий там же — почему
    // не обычный экспорт/импорт модуля (цикл с TelegramModule).
    ExamBotService,
  ],
  exports: [MongooseModule, ExamItemsService, ExamsService, ExamAttemptsService],
})
export class ExamsModule {}
