// LessonsService нужна и модель занятий, и класс (create()/addRecording()
// читают ClassRecord) — импортирует ClassesModule целиком, а не только его
// модель: цикл при этом не возникает, потому что ClassesModule сам берёт
// LessonRecord из LessonModelModule, а не из LessonsModule (см. комментарий
// там же). BroadcastsModule — ради RecordingBroadcastService (addRecording()
// зовёт её после $push записи, docs/PLAN.md §6 «Записи»): цикла тоже нет —
// BroadcastsModule берёт LessonRecord из LessonModelModule, не из
// LessonsModule (тот же приём, ADR-0013). Экспортирует только
// LessonModelModule — SchedulerModule получает ClassRecord/BroadcastRecord/…
// из своих собственных прямых импортов, менять их не пришлось.
import { Module } from '@nestjs/common';
import { BroadcastsModule } from '../broadcasts/broadcasts.module';
import { ClassesModule } from '../classes/classes.module';
import { LessonModelModule } from './lesson-model.module';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  imports: [LessonModelModule, ClassesModule, BroadcastsModule],
  controllers: [LessonsController],
  providers: [LessonsService],
  exports: [LessonModelModule],
})
export class LessonsModule {}
