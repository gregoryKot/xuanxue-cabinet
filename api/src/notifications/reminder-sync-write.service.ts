// Запись выбора напоминаний (ADR-0185, контракт Workshop reminder-sync):
// проверка целей добавления, переход состояния и атомарная запись с проверкой
// ревизии (compare-and-set). Разбор тела и сам переход — чистые функции
// (reminder-sync-patch.ts); здесь только то, что требует базы.
//
// Атомарность без транзакции: документ настроек один на человека, и запись
// условная — `updateOne` срабатывает, только если ревизия в базе всё ещё та, из
// которой считали. Не сработал — между чтением и записью успела другая запись;
// сервер сам перечитывает состояние и пересчитывает те же изменения. Это не
// повтор клиента: клиент получает один ответ о своей же сохранённой записи, а
// для одного ключа побеждает последняя сохранённая запись в порядке сервера.
// Ревизия растёт ровно на единицу за сохранённую запись; запись без изменений
// (снятие невыбранного, повтор сохранённого) документа не трогает.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, QueryFilter, UpdateQuery } from 'mongoose';
import {
  LESSON_SCOPE_CLASS_IDS_MAX,
  type ReminderChange,
  type ReminderSyncSnapshot,
} from '@xuanxue/shared';
import { ClassRecord } from '../classes/class.schema';
import { InvalidInputError, SelectionLimitError } from '../common/errors';
import { LessonRecord } from '../lessons/lesson.schema';
import { ensurePrefsDoc } from './ensure-prefs-doc';
import { NotificationPrefsRecord } from './notification-prefs.schema';
import { applyReminderChanges, type ReminderState } from './reminder-sync-patch';
import {
  ReminderSyncService,
  uniqueSorted,
  type StoredReminderPrefs,
} from './reminder-sync.service';

/** Запись конкурирует только с записями того же человека; десять проигранных
 * подряд — уже не гонка, а сбой: падаем с 500 и логом, а не крутимся. */
const MAX_COMMIT_ATTEMPTS = 10;

const CLASS_MISSING_MESSAGE =
  'Выбранного занятия расписания больше нет в школе. Обновите список занятий и повторите.';
const LESSON_MISSING_MESSAGE =
  'Выбранного занятия больше нет в школе. Обновите список занятий и повторите.';
const SELECTION_LIMIT_MESSAGE = `Можно выбрать не больше ${LESSON_SCOPE_CLASS_IDS_MAX} занятий расписания. Снимите лишние и повторите.`;

const PREFS_PROJECTION = {
  reminderClassIds: 1,
  reminderLessonIds: 1,
  reminderRevision: 1,
  lessonReminderMinutes: 1,
} as const;

function stateOf(prefs: StoredReminderPrefs | null): ReminderState {
  return {
    classIds: uniqueSorted(prefs?.reminderClassIds),
    lessonIds: uniqueSorted(prefs?.reminderLessonIds),
    leadMinutes: prefs?.lessonReminderMinutes ?? null,
  };
}

/** Документ без поля ревизии — ревизия 0, поэтому для 0 подходят оба вида. */
function revisionFilter(
  userId: string,
  revision: number,
): QueryFilter<NotificationPrefsRecord> {
  if (revision > 0) return { userId, reminderRevision: revision };
  return {
    userId,
    $or: [{ reminderRevision: 0 }, { reminderRevision: { $exists: false } }],
  };
}

function committedUpdate(
  next: ReminderState,
  revision: number,
): UpdateQuery<NotificationPrefsRecord> {
  const set = {
    reminderClassIds: next.classIds,
    reminderLessonIds: next.lessonIds,
    reminderRevision: revision,
  };
  return next.leadMinutes === null
    ? { $set: set, $unset: { lessonReminderMinutes: 1 } }
    : { $set: { ...set, lessonReminderMinutes: next.leadMinutes } };
}

function addedIds(
  changes: readonly ReminderChange[],
  kind: 'class' | 'lesson',
): string[] {
  return changes.flatMap((c) => (c.kind === kind && c.selected ? [c.id] : []));
}

@Injectable()
export class ReminderSyncWriteService {
  constructor(
    @InjectModel(NotificationPrefsRecord.name)
    private readonly prefsModel: Model<NotificationPrefsRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    private readonly reminderSync: ReminderSyncService,
  ) {}

  /** Аккаунт — только из сессии или bearer. Весь пакет проверяется до записи:
   * любая ошибка — ничего не записано. Ответ собран из сохранённых значений,
   * а не вторым чтением: между ними могла встать чужая запись. */
  async patch(
    accountId: string,
    changes: readonly ReminderChange[],
  ): Promise<ReminderSyncSnapshot> {
    await this.assertAddTargetsExist(changes);
    const prefs = await this.commit(accountId, changes);
    return this.reminderSync.snapshotFor(accountId, prefs);
  }

  /** Записывает изменения и отдаёт состояние, которое теперь лежит в базе (для
   * записи без изменений — прочитанное). */
  async commit(
    accountId: string,
    changes: readonly ReminderChange[],
  ): Promise<StoredReminderPrefs | null> {
    for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS; attempt += 1) {
      const prefs = await this.readPrefs(accountId);
      const revision = prefs?.reminderRevision ?? 0;
      const { next, changed } = applyReminderChanges(stateOf(prefs), changes);
      if (next.classIds.length > LESSON_SCOPE_CLASS_IDS_MAX) {
        throw new SelectionLimitError(SELECTION_LIMIT_MESSAGE);
      }
      if (!changed) return prefs;

      if (!prefs) await ensurePrefsDoc(this.prefsModel, accountId);
      const written = await this.prefsModel.updateOne(
        revisionFilter(accountId, revision),
        committedUpdate(next, revision + 1),
      );
      if (written.matchedCount === 1) {
        return {
          reminderClassIds: next.classIds,
          reminderLessonIds: next.lessonIds,
          reminderRevision: revision + 1,
          ...(next.leadMinutes === null
            ? {}
            : { lessonReminderMinutes: next.leadMinutes }),
        };
      }
    }
    throw new Error(
      `Запись выбора напоминаний не сохранилась за ${MAX_COMMIT_ATTEMPTS} попыток: ревизия менялась каждый раз (accountId=${accountId})`,
    );
  }

  private readPrefs(accountId: string): Promise<StoredReminderPrefs | null> {
    return this.prefsModel
      .findOne({ userId: accountId }, PREFS_PROJECTION)
      .lean<StoredReminderPrefs | null>();
  }

  /** Снятие выбора существования не требует; добавление — требует: класс любой
   * активности, занятие любого статуса. Размер запроса ограничен 64 ключами. */
  private async assertAddTargetsExist(changes: readonly ReminderChange[]): Promise<void> {
    const classIds = addedIds(changes, 'class');
    const lessonIds = addedIds(changes, 'lesson');
    const [classCount, lessonCount] = await Promise.all([
      classIds.length ? this.classModel.countDocuments({ _id: { $in: classIds } }) : 0,
      lessonIds.length ? this.lessonModel.countDocuments({ _id: { $in: lessonIds } }) : 0,
    ]);
    if (classCount !== classIds.length)
      throw new InvalidInputError(CLASS_MISSING_MESSAGE);
    if (lessonCount !== lessonIds.length)
      throw new InvalidInputError(LESSON_MISSING_MESSAGE);
  }
}
