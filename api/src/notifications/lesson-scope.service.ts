// «О каких занятиях напоминать» и «за сколько минут» (ADR-0162): чтение и
// запись выбора человека в `notification_prefs`. Отдельный сервис, а не методы
// NotificationPrefsService: тот стоит на границе храповика размера, а выбор
// занятий — своя тема (он не про вид уведомления, а про то, о чём именно и
// когда). Документ тот же, одна модель. Проверки «такое занятие есть» здесь
// нет: это решение границы API (LessonNotificationsService), а `set` остаётся
// чистой записью.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { LessonScope } from '@xuanxue/shared';
import { ensurePrefsDoc } from './ensure-prefs-doc';
import { NotificationPrefsRecord } from './notification-prefs.schema';

type LeanScope = Pick<NotificationPrefsRecord, 'lessonScopeMode' | 'lessonClassIds'>;
type LeanLessonPrefs = LeanScope & Pick<NotificationPrefsRecord, 'lessonReminderMinutes'>;

/** Всё, что тик напоминания знает о человеке: о каких занятиях и за сколько.
 * `reminderMinutes` нет — «как в школе». */
export interface LessonPrefs {
  scope: LessonScope;
  reminderMinutes?: number;
}

/** Выбор человека и то, делал ли он его сам: «все» по умолчанию и «все»,
 * выбранное руками, читаются одинаково, а подсказка в ленте (ADR-0162, п. 5)
 * должна их различать. */
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
  const prefs: LessonPrefs = { scope: toScope(doc) };
  // Ключ не заводим пустым: «как в школе» — это отсутствие значения.
  if (doc?.lessonReminderMinutes !== undefined) {
    prefs.reminderMinutes = doc.lessonReminderMinutes;
  }
  return prefs;
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

  /** Своё «за сколько минут» или `undefined` — «как в школе». */
  async getReminderMinutes(userId: string): Promise<number | undefined> {
    const doc = await this.model
      .findOne({ userId }, { lessonReminderMinutes: 1 })
      .lean<Pick<NotificationPrefsRecord, 'lessonReminderMinutes'> | null>();
    return doc?.lessonReminderMinutes;
  }

  /** Выбор «о каких» и «за сколько» целой пачки людей одним запросом — тик
   * напоминания о занятии не читает настройки по одному ученику в цикле.
   * Каждый входной id есть в результате: у тех, у кого документа нет, — `all` и
   * «как в школе». */
  async getManyLessonPrefs(
    userIds: readonly string[],
  ): Promise<Map<string, LessonPrefs>> {
    if (userIds.length === 0) return new Map();
    const docs = await this.model
      .find(
        { userId: { $in: [...userIds] } },
        { userId: 1, lessonScopeMode: 1, lessonClassIds: 1, lessonReminderMinutes: 1 },
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

  /** Записать своё «за сколько минут»; `null` — вернуться к «как в школе»
   * (`$unset`, а не 0: ноль означал бы «напомнить за 0 минут»). Сброс документ
   * не заводит: сбрасывать нечего там, где ничего не выбирали. Идемпотентна —
   * то же значение второй раз даёт тот же документ. */
  async setReminderMinutes(userId: string, minutes: number | null): Promise<void> {
    if (minutes === null) {
      await this.model.updateOne({ userId }, { $unset: { lessonReminderMinutes: 1 } });
      return;
    }
    await ensurePrefsDoc(this.model, userId);
    await this.model.updateOne({ userId }, { $set: { lessonReminderMinutes: minutes } });
  }
}
