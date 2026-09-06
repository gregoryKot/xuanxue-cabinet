// LessonsService нужна и модель занятий, и класс (create()/addRecording()
// читают ClassRecord) — импортирует ClassesModule целиком, а не только его
// модель: цикл при этом не возникает, потому что ClassesModule сам берёт
// LessonRecord из LessonModelModule, а не из LessonsModule (см. комментарий
// там же). Экспортирует только LessonModelModule — SchedulerModule получает
// ClassRecord из своего собственного прямого импорта ClassesModule, менять
// его не пришлось.
import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { LessonModelModule } from './lesson-model.module';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  imports: [LessonModelModule, ClassesModule],
  controllers: [LessonsController],
  providers: [LessonsService],
  exports: [LessonModelModule],
})
export class LessonsModule {}
