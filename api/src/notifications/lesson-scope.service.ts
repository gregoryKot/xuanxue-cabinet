// «О каких занятиях» (ADR-0162): чтение и запись выбора человека в
// `notification_prefs` для отмен, записей и новых материалов, а для тика — чтение всего,
// что он знает о человеке, включая выбор и «за сколько» напоминаний (ADR-0185), которые
// пишет синхронизация. Отдельный сервис, а не методы NotificationPrefsService: тот стоит
// на границе храповика размера, а выбор занятий — своя тема (он не про вид уведомления,
// а про то, о чём именно и когда). Документ тот же, одна модель. Проверки «такое занятие
// есть» здесь нет: это решение границы API (LessonNotificationsService), а `set`
// остаётся чистой записью.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { LessonScope } from '@xuanxue/shared';
import { ensurePrefsDoc } from './ensure-prefs-doc';
import { NotificationPrefsRecord } from './notification-prefs.schema';

type LeanScope = Pick<NotificationPrefsRecord, 'lessonScopeMode' | 'lessonClassIds'>;
type LeanLessonPrefs = LeanScope &
  Pick<
    NotificationPrefsRecord,
    'lessonReminderMinutes' | 'reminderClassIds' | 'reminderLessonIds'
  >;

/** Всё, что шаги тика знают о человеке: `scope` — для отмены, записи и материалов
 * (ADR-0162), `reminder*Ids` — для «Занятие скоро» (ADR-0185), друг на друга они не
 * влияют. Нет документа или поля — пустые множества; `reminderMinutes` нет — «как в школе». */
export interface LessonPrefs {
  scope: LessonScope;
  reminderMinutes?: number;
  reminderClassIds: ReadonlySet<string>;
  reminderLessonIds: ReadonlySet<string>;
}

/** Выбор человека и то, делал ли он его сам: «все» по умолчанию и «все»,
 * выбранное руками, читаются одинаково, но в ответе GET /me/notifications/lessons
 * различаются (scopeChosen). */
export interface LessonScopeChoice {
  scope: LessonScope;
  chosen: boolean;
}

/** Нет документа или в нём нет выбора — «как у школы»: обо всех занятиях,
 * галочек нет. Каждый вызов собирает свой объект — массив из общей константы
 * кто-нибудь мог бы дополнить. */
function toScope(doc: LeanScope | null | undefined): LessonScope {
  return {
    mode: doc?.lessonScopeMode ?? 'all',
    classIds: doc?.lessonClassIds ?? [],
  };
}

function toLessonPrefs(doc: LeanLessonPrefs | undefined): LessonPrefs {
  const minutes = doc?.lessonReminderMinutes;
  return {
    scope: toScope(doc),
    reminderClassIds: new Set(doc?.reminderClassIds),
    reminderLessonIds: new Set(doc?.reminderLessonIds),
    // Ключ не заводим пустым: «как в школе» — это отсутствие значения.
    ...(minutes !== undefined && { reminderMinutes: minutes }),
  };
}

@Injectable()
export class LessonScopeService {
  constructor(
    @InjectModel(NotificationPrefsRecord.name)
    private readonly model: Model<NotificationPrefsRecord>,
  ) {}

  /** Выбор одним чтением. `chosen` — в документе записан режим (даже `all`):
   * переключатели видов документ заводят, а режим не трогают, и «есть
   * документ» тут не признак. */
  async getChoice(userId: string): Promise<LessonScopeChoice> {
    const doc = await this.model
      .findOne({ userId }, { lessonScopeMode: 1, lessonClassIds: 1 })
      .lean<LeanScope | null>();
    return { scope: toScope(doc), chosen: Boolean(doc?.lessonScopeMode) };
  }

  /** Выбор «о каких», «за сколько» и напоминаний целой пачки людей одним запросом —
   * шаги тика не читают настройки по одному в цикле. Каждый входной id есть в
   * результате: нет документа — `all`, «как в школе», пустые выборы напоминаний. */
  async getManyLessonPrefs(
    userIds: readonly string[],
  ): Promise<Map<string, LessonPrefs>> {
    if (userIds.length === 0) return new Map();
    const docs = await this.model
      .find(
        { userId: { $in: [...userIds] } },
        {
          userId: 1,
          lessonScopeMode: 1,
          lessonClassIds: 1,
          lessonReminderMinutes: 1,
          reminderClassIds: 1,
          reminderLessonIds: 1,
        },
      )
      .lean<(LeanLessonPrefs & { userId: string })[]>();
    const byUserId = new Map(docs.map((doc) => [doc.userId, doc]));
    return new Map(userIds.map((id) => [id, toLessonPrefs(byUserId.get(id))]));
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
