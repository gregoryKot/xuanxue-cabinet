// «О каких занятиях напоминать» (ADR-0162): чтение и запись выбора человека в
// `notification_prefs`. Отдельный сервис, а не методы NotificationPrefsService:
// тот стоит на границе храповика размера, а выбор занятий — своя тема (он не
// про вид уведомления, а про то, о чём именно). Документ тот же, одна модель.
// Проверки «такое занятие есть» здесь нет: это решение границы API
// (LessonNotificationsService), а `set` остаётся чистой записью.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { LessonScope } from '@xuanxue/shared';
import { ensurePrefsDoc } from './ensure-prefs-doc';
import { NotificationPrefsRecord } from './notification-prefs.schema';

type LeanScope = Pick<NotificationPrefsRecord, 'lessonScopeMode' | 'lessonClassIds'>;

/** Выбор «как у школы»: обо всех занятиях, галочек нет. Каждый вызов получает
 * свой объект — массив из общей константы кто-нибудь мог бы дополнить. */
function defaultScope(): LessonScope {
  return { mode: 'all', classIds: [] };
}

function toScope(doc: LeanScope | null | undefined): LessonScope {
  return {
    mode: doc?.lessonScopeMode ?? 'all',
    classIds: doc?.lessonClassIds ?? [],
  };
}

@Injectable()
export class LessonScopeService {
  constructor(
    @InjectModel(NotificationPrefsRecord.name)
    private readonly model: Model<NotificationPrefsRecord>,
  ) {}

  async get(userId: string): Promise<LessonScope> {
    const doc = await this.model
      .findOne({ userId }, { lessonScopeMode: 1, lessonClassIds: 1 })
      .lean<LeanScope | null>();
    return toScope(doc);
  }

  /** Выбор целой пачки людей одним запросом — тик напоминания о занятии не
   * читает настройки по одному ученику в цикле. Каждый входной id есть в
   * результате: у тех, у кого документа нет, — `all`. */
  async getMany(userIds: readonly string[]): Promise<Map<string, LessonScope>> {
    if (userIds.length === 0) return new Map();
    const docs = await this.model
      .find(
        { userId: { $in: [...userIds] } },
        { userId: 1, lessonScopeMode: 1, lessonClassIds: 1 },
      )
      .lean<(LeanScope & { userId: string })[]>();
    const byUserId = new Map(docs.map((doc) => [doc.userId, toScope(doc)]));
    return new Map(userIds.map((id) => [id, byUserId.get(id) ?? defaultScope()]));
  }

  /** Записать выбор целиком. Идемпотентна: то же значение второй раз даёт тот
   * же документ. Повторы в списке схлопываются — галочка либо стоит, либо нет.
   * Режим `all` список не стирает: вернулся к «выбранным» — галочки на месте. */
  async set(userId: string, scope: LessonScope): Promise<void> {
    await ensurePrefsDoc(this.model, userId);
    await this.model.updateOne(
      { userId },
      {
        $set: {
          lessonScopeMode: scope.mode,
          lessonClassIds: [...new Set(scope.classIds)],
        },
      },
    );
  }
}
