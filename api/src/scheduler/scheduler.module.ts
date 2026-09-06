// Планировщику нужны и модели занятий, и классов — импортирует оба модуля
// вместо того, чтобы LessonsModule сам держал ClassRecord (тот приём плодил
// цикл: ClassesModule уже импортирует LessonsModule ради
// lessonModel.exists() в classes.service.ts). Ни ClassesModule, ни
// LessonsModule про SchedulerModule не знают — цикла нет.
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
