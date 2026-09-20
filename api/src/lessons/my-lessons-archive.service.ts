// GET /me/lessons/archive (ТЗ docs/PLAN.md §14 слой 3.3) — прошедшие занятия
// школы назад от `now`, по убыванию `startsAt`. Отдельный файл, не метод в
// MyLessonsService: тот сервис уже занят подбором «вперёд от now» и стоит на
// границе файл-храповика (CLAUDE.md «Храповики» — check-file-size-ratchet.mjs
// считает каждый файл отдельно), второй метод в нём пересёк бы её.
//
// В отличие от MyLessonsService (прошедшие занятия не отдаёт вовсе),
// отменённое прошедшее занятие из архива не выкидывается: ученик должен
// увидеть, что занятие было отменено, а не решить, что оно пропало из
// списка (ТЗ §14, «3.3. Архив занятий у ученика»), поэтому фильтр — только
// по времени, статус едет в DTO как есть.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model } from 'mongoose';
import {
  MY_ARCHIVE_LIMIT_DEFAULT,
  type ListMyArchivedLessonsQuery,
  type MyArchivedLessonDto,
} from '@xuanxue/shared';
import { ClassRecord } from '../classes/class.schema';
import { LessonMaterialsService } from '../materials/lesson-materials.service';
import { LessonRecord } from './lesson.schema';
import type { LeanLesson } from './lesson.mapper';
import { findLessonClassesByIds, joinLessonsWithClasses } from './lesson-classes.lookup';
import { toMyArchivedLessonDto } from './my-archived-lesson.mapper';

@Injectable()
export class MyLessonsArchiveService {
  constructor(
    @InjectModel(LessonRecord.name) private readonly model: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    private readonly lessonMaterialsService: LessonMaterialsService,
  ) {}

  /** `isStaff` — уже вычисленный `isStaffRole(user.roles)` из контроллера,
   * тот же приём, что у MaterialsService.listForStudent (ADR-0048): рубильник
   * платного доступа к материалам действует и здесь. */
  async list(
    query: ListMyArchivedLessonsQuery,
    now: DateTime,
    isStaff: boolean,
  ): Promise<MyArchivedLessonDto[]> {
    const docs = await this.model
      .find({ startsAt: { $lt: now.toJSDate() } })
      .sort({ startsAt: -1 })
      .limit(query.limit ?? MY_ARCHIVE_LIMIT_DEFAULT)
      .lean<LeanLesson[]>();

    // Класс-лукап и материалы независимы друг от друга — один Promise.all,
    // не последовательные await (тот же приём, что MaterialsService.listForStudent).
    const [classById, materialsByLessonId] = await Promise.all([
      findLessonClassesByIds(
        this.classModel,
        docs.map((doc) => doc.classId),
      ),
      this.lessonMaterialsService.findByLessonIds(
        docs.map((doc) => doc._id.toString()),
        isStaff,
      ),
    ]);

    return joinLessonsWithClasses(docs, classById, (lesson, cls) =>
      toMyArchivedLessonDto(
        lesson,
        cls,
        materialsByLessonId.get(lesson._id.toString()) ?? [],
      ),
    );
  }
}
