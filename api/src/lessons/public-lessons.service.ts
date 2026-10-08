// GET /public/lessons (ADR-0170, контракт Workshop) — расписание школы без
// Zoom для daychi. Отдельный сервис, а не флаг у MyLessonsService: две
// проекции в одном методе — риск, что поле для сессии утечёт в публичный
// ответ. Общее — только запрос классов (lesson-classes.lookup.ts).
// Отменённые занятия включены: клиент должен показать «занятия не будет».
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types, type QueryFilter } from 'mongoose';
import type { ListPublicLessonsQuery, PublicLessonDto } from '@xuanxue/shared';
import { ClassRecord } from '../classes/class.schema';
import { LessonRecord } from './lesson.schema';
import type { LeanLesson } from './lesson.mapper';
import { findLessonClassesByIds } from './lesson-classes.lookup';
import { objectIdString, projectPublicLesson } from './public-lesson.mapper';
import { resolvePublicLessonsWindow } from './public-lessons-window';

@Injectable()
export class PublicLessonsService {
  private readonly logger = new Logger(PublicLessonsService.name);

  constructor(
    @InjectModel(LessonRecord.name) private readonly model: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
  ) {}

  /**
   * Битое занятие (нет класса, поле не того типа) выпадает из ответа с
   * error-логом, остальные уходят с 200 — контракт Workshop, случай 6. Лог
   * обязателен именно здесь: ответ успешный, глобальный фильтр 500 его не
   * увидит. Сбой чтения базы или ошибка кода летят дальше и дают 500.
   */
  async list(
    query: ListPublicLessonsQuery,
    now: DateTime,
    requestId?: string,
  ): Promise<PublicLessonDto[]> {
    const selection = resolvePublicLessonsWindow(query);
    const filter: QueryFilter<LessonRecord> =
      selection.mode === 'count'
        ? { startsAt: { $gte: now.toJSDate() } }
        : { startsAt: { $gte: selection.from.toJSDate(), $lt: selection.to.toJSDate() } };

    const cursor = this.model.find(filter).sort({ startsAt: 1 });
    // Окно — без предела по числу занятий (контракт): ширину ограничивает
    // сама проверка окна, 28 суток. «Ближайшие» берут limit кандидатов до
    // проверки и выпавшее не добирают (контракт: no refill).
    const docs = await (
      selection.mode === 'count' ? cursor.limit(selection.limit) : cursor
    ).lean<LeanLesson[]>();

    const classIds = docs
      .map((doc): unknown => doc.classId)
      .filter((id): id is Types.ObjectId => id instanceof Types.ObjectId);
    const classById = await findLessonClassesByIds(this.classModel, classIds);

    const dtos: PublicLessonDto[] = [];
    for (const doc of docs) {
      const classId = objectIdString(doc.classId);
      const cls = classId === undefined ? undefined : classById.get(classId);
      const projection = projectPublicLesson(doc, cls);
      if ('dto' in projection) {
        dtos.push(projection.dto);
        continue;
      }
      // Тема и Zoom в лог не идут: только id и причина.
      this.logger.error(
        `Публичное занятие пропущено (requestId=${requestId ?? '-'}, lessonId=${objectIdString(doc._id) ?? '-'}, classId=${classId ?? '-'}): ${projection.reason}`,
      );
    }
    return dtos;
  }
}
