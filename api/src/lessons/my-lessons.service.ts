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
import { Model, Types } from 'mongoose';
import {
  MY_LESSONS_LIMIT_DEFAULT,
  type ListMyLessonsQuery,
  type MyLessonDto,
} from '@xuanxue/shared';
import { CLASS_ENCRYPT_SCHEMA, ClassRecord } from '../classes/class.schema';
import { decryptRecord } from '../utils/encryption';
import { LESSON_ENCRYPT_SCHEMA, LessonRecord } from './lesson.schema';
import type { LeanLesson } from './lesson.mapper';
import { toMyLessonDto, type MyLessonClassInput } from './my-lesson.mapper';

// `Pick<ClassRecord, ...>` вместо простого пересечения с MyLessonClassInput —
// тот же приём, что у RawLeanExam/RawLeanExamItem (exam.mapper.ts/
// exam-item.mapper.ts): иначе тип не проходит ограничение
// `T extends Record<string, unknown>` у decryptRecord.
type RawLeanMyLessonClass = Pick<
  ClassRecord,
  'title' | 'groupLabel' | 'format' | 'location' | 'zoomLink' | 'zoomPassword'
> & { _id: Types.ObjectId };

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

    const classById = await this.findClassesByIds(docs.map((doc) => doc.classId));

    // Класс у даты занятия удалить нельзя, пока на него ссылается хоть одна
    // дата (ClassesService.remove) — пропавший класс означает рассинхрон
    // данных, не штатный случай; такую дату молча не показываем, а не роняем
    // весь список ученику.
    return docs
      .map((doc) => {
        const cls = classById.get(doc.classId.toString());
        if (!cls) return null;
        return toMyLessonDto(decryptRecord(doc, LESSON_ENCRYPT_SCHEMA), cls);
      })
      .filter((dto): dto is MyLessonDto => dto !== null);
  }

  private async findClassesByIds(
    classIds: Types.ObjectId[],
  ): Promise<Map<string, MyLessonClassInput>> {
    const uniqueIds = [...new Set(classIds.map((id) => id.toString()))];
    const docs = await this.classModel
      .find({ _id: { $in: uniqueIds } })
      .lean<RawLeanMyLessonClass[]>();
    return new Map(
      docs.map((doc) => [doc._id.toString(), decryptRecord(doc, CLASS_ENCRYPT_SCHEMA)]),
    );
  }
}
