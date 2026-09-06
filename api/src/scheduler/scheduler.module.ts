// ClassesModule берёт модель занятий из LessonModelModule (не из
// LessonsModule — так и разорван цикл, см. lesson-model.module.ts),
// LessonsModule зависит от ClassesModule ради модели класса. Планировщику
// нужны обе модели — SchedulerModule импортирует оба домена напрямую; ни
// ClassesModule, ни LessonsModule про SchedulerModule не знают — цикла нет.
import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { LessonPlannerService } from '../lessons/lesson-planner.service';
import { LessonsModule } from '../lessons/lessons.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [ClassesModule, LessonsModule],
  providers: [LessonPlannerService, SchedulerService],
})
export class SchedulerModule {}
