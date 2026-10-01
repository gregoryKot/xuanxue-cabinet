// Число для школы к выбору «о каких занятиях» и «за сколько» (ADR-0162, п. 5):
// сколько активных учеников этим меню воспользовались. Три числа одним
// запросом, а не список учеников и их настройки: «дай всё» запрещено (CLAUDE.md
// «API»), да и штату нужно только «мало или много», а не кто именно.
// Ученик — тот же, что у `listActiveStudents` (люди без единой роли и без
// блокировки, ADR-0026); считаем в базе, а не по списку с потолком в 200 строк:
// потолок молча занизил бы «из скольких».
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Expression, Model, PipelineStage } from 'mongoose';
import type { LessonPrefsStatsDto } from '@xuanxue/shared';
import { UserRecord } from '../users/user.schema';
import { NotificationPrefsRecord } from './notification-prefs.schema';

// Имя поля внутри `$lookup`: документ настроек человека (или пустой массив,
// если он ничего не выбирал и документа у него нет).
const PREFS_FIELD = 'prefs';

/** 1, если условие верно, иначе 0 — слагаемое для `$sum` в `$group`. */
function countIf(condition: Expression): { $sum: Expression } {
  return { $sum: { $cond: [condition, 1, 0] } };
}

@Injectable()
export class LessonPrefsStatsService {
  constructor(
    @InjectModel(UserRecord.name) private readonly userModel: Model<UserRecord>,
    @InjectModel(NotificationPrefsRecord.name)
    private readonly prefsModel: Model<NotificationPrefsRecord>,
  ) {}

  async getStats(): Promise<LessonPrefsStatsDto> {
    const prefs = (field: string) => `$${PREFS_FIELD}.${field}`;
    const pipeline: PipelineStage[] = [
      // Только настоящие ученики: штат в режиме ученика (ADR-0163) хранит в БД
      // настоящие роли и сюда не попадает — число на «Шаблонах» не растёт от
      // того, что владелец проверяет кабинет глазами ученика.
      { $match: { roles: { $size: 0 }, status: 'active' } },
      {
        $lookup: {
          // Документ настроек хранит `userId` строкой, а `_id` человека —
          // ObjectId: сверка через строку, по уникальному индексу `userId`.
          from: this.prefsModel.collection.name,
          let: { id: { $toString: '$_id' } },
          pipeline: [
            { $match: { $expr: { $eq: ['$userId', '$$id'] } } },
            { $project: { lessonScopeMode: 1, lessonReminderMinutes: 1 } },
          ],
          as: PREFS_FIELD,
        },
      },
      // Документ один на человека (уникальный индекс); нет документа — ученик
      // всё равно считается в `activeStudents`.
      { $unwind: { path: `$${PREFS_FIELD}`, preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          activeStudents: { $sum: 1 },
          chosenClasses: countIf({ $eq: [prefs('lessonScopeMode'), 'selected'] }),
          ownReminder: countIf({ $isNumber: prefs('lessonReminderMinutes') }),
        },
      },
    ];
    const [totals] = await this.userModel.aggregate<LessonPrefsStatsDto>(pipeline);
    // Пустая база — честные нули, не `undefined`: `$group` без документов
    // ничего не возвращает.
    return {
      activeStudents: totals?.activeStudents ?? 0,
      chosenClasses: totals?.chosenClasses ?? 0,
      ownReminder: totals?.ownReminder ?? 0,
    };
  }
}
