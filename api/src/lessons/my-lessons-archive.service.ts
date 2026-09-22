// GET /me/lessons/archive (ТЗ docs/PLAN.md §14 слой 3.3) — прошедшие занятия
// школы назад от `now`, по убыванию `startsAt`. Отдельный файл, не метод в
// MyLessonsService: тот сервис уже занят подбором «вперёд от now» и стоит на
// границе файл-храповика (CLAUDE.md «Храповики» — check-file-size-ratchet.mjs
// считает каждый файл отдельно), второй метод в нём пересёк бы её.
//
// Решение владельца 2026-09-22 (ADR-0114, отменяет ТЗ §14 «занятия без
// записи в архив тоже идут»): архив — это записи занятий, а не журнал
// посещаемости, поэтому занятие без ни одной записи в него не попадает.
// Отменённое прошедшее занятие с записью — исключение из этого решения, не
// из старого правила: ученик должен увидеть, что занятие было отменено, а
// запись у него всё равно есть, поэтому фильтр по времени и по статусу
// разные — по времени в запросе, статус едет в DTO как есть.
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
   * тот же приём, что у MaterialsService.listForStudent (ADR-0058):
   * служебные материалы (`access: 'staff'`) скрыты от ученика и здесь. */
  async list(
    query: ListMyArchivedLessonsQuery,
    now: DateTime,
    isStaff: boolean,
  ): Promise<MyArchivedLessonDto[]> {
    // `'recordings.0': { $exists: true }` — отбор занятий без записи внутри
    // запроса, не после выборки: лимит (MY_ARCHIVE_LIMIT_DEFAULT) применяется
    // до отбора, и, отфильтруй мы после `.find()`, занятия без записи в
    // начале списка съедали бы место у занятий с записью дальше (тот же
    // приём, что у MaterialsService.listForStudent с `access: 'staff'`,
    // ADR-0058).
    const docs = await this.model
      .find({
        startsAt: { $lt: now.toJSDate() },
        'recordings.0': { $exists: true },
      })
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

    const dtos = joinLessonsWithClasses(docs, classById, (lesson, cls) =>
      toMyArchivedLessonDto(
        lesson,
        cls,
        materialsByLessonId.get(lesson._id.toString()) ?? [],
      ),
    );

    // Фильтра запроса мало: он видит сырое поле `recordings` в базе, а
    // `toMyArchivedLessonDto` (my-archived-lesson.mapper.ts) следом выбрасывает
    // из него записи без `url` и без `telegramFileId` — такого в базе быть не
    // должно (`assertHasRecordingSource` на входе записи), но схема это
    // допускает. Единственная такая запись даёт `recordings: []` в DTO уже
    // после отбора запросом — карточку без единой ссылки в архиве решение
    // владельца не предполагает. На лимит списка эта проверка не давит:
    // случай — рассинхрон данных, а не обычный путь, съесть заметную часть
    // лимита ему нечем.
    return dtos.filter((dto) => dto.recordings.length > 0);
  }
}
