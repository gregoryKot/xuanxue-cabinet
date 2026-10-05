// GET /public/lessons (ADR-0170, контракт Workshop) — расписание школы без
// Zoom для daychi. Отдельный сервис, а не флаг у MyLessonsService: две
// проекции в одном методе — риск, что поле для сессии утечёт в публичный
// ответ. Общее — только запрос классов и join (lesson-classes.lookup.ts).
// Отменённые занятия включены: клиент должен показать «занятия не будет».
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, type QueryFilter } from 'mongoose';
import type { ListPublicLessonsQuery, PublicLessonDto } from '@xuanxue/shared';
import { ClassRecord } from '../classes/class.schema';
import { LessonRecord } from './lesson.schema';
import type { LeanLesson } from './lesson.mapper';
import { findLessonClassesByIds, joinLessonsWithClasses } from './lesson-classes.lookup';
import { toPublicLessonDto } from './public-lesson.mapper';
import { resolvePublicLessonsWindow } from './public-lessons-window';

@Injectable()
export class PublicLessonsService {
  constructor(
    @InjectModel(LessonRecord.name) private readonly model: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
  ) {}

  async list(query: ListPublicLessonsQuery, now: DateTime): Promise<PublicLessonDto[]> {
    const selection = resolvePublicLessonsWindow(query);
    const filter: QueryFilter<LessonRecord> =
      selection.mode === 'count'
        ? { startsAt: { $gte: now.toJSDate() } }
        : { startsAt: { $gte: selection.from.toJSDate(), $lt: selection.to.toJSDate() } };

    const cursor = this.model.find(filter).sort({ startsAt: 1 });
    // Окно — без предела по числу занятий (контракт): ширину ограничивает
    // сама проверка окна, 28 суток.
    const docs = await (
      selection.mode === 'count' ? cursor.limit(selection.limit) : cursor
    ).lean<LeanLesson[]>();

    const classById = await findLessonClassesByIds(
      this.classModel,
      docs.map((doc) => doc.classId),
    );

    return joinLessonsWithClasses(docs, classById, toPublicLessonDto, {
      missingClass: 'fail',
    });
  }
}
