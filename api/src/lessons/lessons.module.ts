// LessonsService нужна и модель занятий, и класс (create()/addRecording()
// читают ClassRecord) — импортирует ClassesModule целиком, а не только его
// модель: цикл при этом не возникает, потому что ClassesModule сам берёт
// LessonRecord из LessonModelModule, а не из LessonsModule (см. комментарий
// там же). BroadcastsModule — ради RecordingBroadcastService (addRecording()
// зовёт её после $push записи, docs/PLAN.md §6 «Записи») и
// LessonLinkRebuildService (update() при переносе startsAt, ADR-0054): цикла
// тоже нет — BroadcastsModule берёт LessonRecord из LessonModelModule, не из
// LessonsModule (тот же приём, ADR-0013). LessonModelModule — SchedulerModule
// получает ClassRecord/BroadcastRecord/… из своих собственных прямых
// импортов, менять их не пришлось. LessonsService — дополнительно для
// TelegramModule (update() у /тема и «Изменить тему», addRecording() у
// «Запись?»). MaterialModelModule — remove() отвязывает удалённую дату от
// materials.lessonIds (ADR-0056), только модель, тот же приём: полный импорт
// MaterialsModule замкнул бы цикл через её собственный импорт ClassesModule
// (эта модель нужна LessonsService, не MyLessonsArchiveService). MaterialsModule
// — отдельно, ради LessonMaterialsService: архив ученика (слой 3.9, ADR-0056
// «Ученик видит привязку там, где ищет») подтягивает материалы своей даты.
// Цикла нет: MaterialsModule не импортирует LessonsModule и о нём не знает
// (сам зависит только от ClassesModule/SettingsModule/MaterialModelModule).
import { Module } from '@nestjs/common';
import { BroadcastsModule } from '../broadcasts/broadcasts.module';
import { ClassesModule } from '../classes/classes.module';
import { MaterialModelModule } from '../materials/material-model.module';
import { MaterialsModule } from '../materials/materials.module';
import { UserModelModule } from '../users/user-model.module';
import { LessonModelModule } from './lesson-model.module';
import { LessonRecordingSummaryService } from './lesson-recording-summary.service';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';
import { MyLessonsArchiveService } from './my-lessons-archive.service';
import { MyLessonsController } from './my-lessons.controller';
import { MyLessonsService } from './my-lessons.service';

@Module({
  // UserModelModule — update() проверяет leaderId через assertTeacherExists
  // (аудит В4), тот же приём, что у ClassesModule. ClassesModule даёт и
  // ClassRecord для MyLessonsService/MyLessonsArchiveService (`/me/lessons`,
  // ТЗ docs/PLAN.md §11 и §14).
  imports: [
    LessonModelModule,
    ClassesModule,
    BroadcastsModule,
    UserModelModule,
    MaterialModelModule,
    MaterialsModule,
  ],
  controllers: [LessonsController, MyLessonsController],
  providers: [
    LessonsService,
    MyLessonsService,
    MyLessonsArchiveService,
    LessonRecordingSummaryService,
  ],
  // MyLessonsService — ещё и боту: экран «Ближайшие занятия» показывает тот
  // же подбор, что `GET /me/lessons` (menu-command.handler.ts).
  exports: [LessonModelModule, LessonsService, MyLessonsService],
})
export class LessonsModule {}
