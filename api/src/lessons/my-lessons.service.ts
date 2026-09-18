// GET /me/lessons (ТЗ docs/PLAN.md §11 слой 4.1) — ближайшие занятия
// вперёд от `now`, всей школы: групп у ученика пока нет (кто на какие занятия
// ходит — этап 3), поэтому раздать «свои» занятия нечем — отдаём расписание
// школы целиком, как видит его сама школа. Отметка намеренная: через месяц
// это не должно читаться как недосмотр (ТЗ, раздел «GET /api/me/lessons»).
//
// Прошедшие занятия не отдаём вовсе (включая отменённые за прошедшее время) —
// один и тот же фильтр `startsAt >= now` закрывает оба случая из ТЗ.
// Отменённое, но ещё предстоящее занятие остаётся в списке со своим статусом
// (`cancelled`) — ученик должен понять, что занятия не будет, а не решить,
// что оно пропало из расписания по ошибке.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model } from 'mongoose';
import {
  MY_LESSONS_LIMIT_DEFAULT,
  type ListMyLessonsQuery,
  type MyLessonDto,
} from '@xuanxue/shared';
import { ClassRecord } from '../classes/class.schema';
import { LessonRecord } from './lesson.schema';
import type { LeanLesson } from './lesson.mapper';
import { findLessonClassesByIds, joinLessonsWithClasses } from './lesson-classes.lookup';
import { toMyLessonDto } from './my-lesson.mapper';

@Injectable()
export class MyLessonsService {
  constructor(
    @InjectModel(LessonRecord.name) private readonly model: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
  ) {}

  async list(query: ListMyLessonsQuery, now: DateTime): Promise<MyLessonDto[]> {
    const docs = await this.model
      .find({ startsAt: { $gte: now.toJSDate() } })
      .sort({ startsAt: 1 })
      .limit(query.limit ?? MY_LESSONS_LIMIT_DEFAULT)
      .lean<LeanLesson[]>();

    const classById = await findLessonClassesByIds(
      this.classModel,
      docs.map((doc) => doc.classId),
    );

    return joinLessonsWithClasses(docs, classById, toMyLessonDto);
  }
}
