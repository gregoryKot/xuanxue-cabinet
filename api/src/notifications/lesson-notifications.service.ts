// «О каких занятиях» (ADR-0162), сторона API: выбор человека и список активных
// занятий, из которых он ставит галочки. Запись и чтение выбора — у
// LessonScopeService, здесь то, чего ему знать не положено: есть ли такое
// занятие в расписании.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { MyLessonNotificationsDto, UpdateLessonScopeInput } from '@xuanxue/shared';
import { ClassRecord } from '../classes/class.schema';
import { InvalidInputError } from '../common/errors';
import { listLessonScopeClasses } from './lesson-scope-classes';
import { LessonScopeService } from './lesson-scope.service';

// Тихо выброшенная галочка — тот же тихий отказ, что и неотправленное
// напоминание (ADR-0162), поэтому несуществующее занятие — 400, а не молчание.
// Чаще всего это учитель, удаливший занятие, пока экран был открыт.
const CLASS_GONE_MESSAGE =
  'Такого занятия больше нет в расписании. Обновите страницу и отметьте занятия заново.';

@Injectable()
export class LessonNotificationsService {
  constructor(
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    private readonly lessonScopes: LessonScopeService,
  ) {}

  async get(userId: string): Promise<MyLessonNotificationsDto> {
    const [scope, classes] = await Promise.all([
      this.lessonScopes.get(userId),
      listLessonScopeClasses(this.classModel),
    ]);
    return { scope, classes };
  }

  /** Ответ — то, что теперь видит человек в `GET`, без второго запроса
   * (ADR-0087). */
  async update(
    userId: string,
    input: UpdateLessonScopeInput,
  ): Promise<MyLessonNotificationsDto> {
    await this.assertClassesExist(input.classIds);
    await this.lessonScopes.set(userId, input);
    return this.get(userId);
  }

  /** Существует любое занятие, не только активное: выключенное учителем позже
   * остаётся в списке и ни на что не влияет (ADR-0162). Форму id уже проверил
   * DTO (`@IsMongoId`), в запрос к Mongo идут только настоящие ObjectId. */
  private async assertClassesExist(classIds: readonly string[]): Promise<void> {
    const unique = [...new Set(classIds)];
    if (unique.length === 0) return;
    const found = await this.classModel.countDocuments({ _id: { $in: unique } });
    if (found !== unique.length) throw new InvalidInputError(CLASS_GONE_MESSAGE);
  }
}
