// Снимок настроек напоминаний для браузера и приложения Daychi (ADR-0185,
// контракт Workshop reminder-sync): выбор человека целиком одним ответом.
// Маппер чистый и живёт здесь же: порядок и умолчания снимка — часть
// контракта, и проверять их надо без Mongo.
//
// Клиент сравнивает снимки по `revision` и по содержимому, поэтому всё, что
// хранится без порядка, отдаётся в одном, не зависящем от языка и базы:
// сортировка по кодовым единицам, а не `localeCompare`.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  REMINDER_SYNC_VERSION,
  type LessonScopeClassDto,
  type ReminderSyncSnapshot,
} from '@xuanxue/shared';
import { ClassRecord } from '../classes/class.schema';
import { SettingsService } from '../settings/settings.service';
import { listLessonScopeClasses } from './lesson-scope-classes';
import { NotificationPrefsRecord } from './notification-prefs.schema';

export type StoredReminderPrefs = Pick<
  NotificationPrefsRecord,
  'reminderClassIds' | 'reminderLessonIds' | 'reminderRevision' | 'lessonReminderMinutes'
>;

export interface ReminderSyncSource {
  accountId: string;
  /** `null` — документа настроек у человека ещё нет. */
  prefs: StoredReminderPrefs | null;
  schoolMinutes: number;
  classes: readonly LessonScopeClassDto[];
}

function byCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function uniqueSorted(ids: readonly string[] | undefined): string[] {
  return [...new Set(ids ?? [])].sort(byCodeUnits);
}

export function toReminderSyncSnapshot(source: ReminderSyncSource): ReminderSyncSnapshot {
  const { prefs } = source;
  return {
    version: REMINDER_SYNC_VERSION,
    accountId: source.accountId,
    revision: String(prefs?.reminderRevision ?? 0),
    classIds: uniqueSorted(prefs?.reminderClassIds),
    lessonIds: uniqueSorted(prefs?.reminderLessonIds),
    leadMinutes: prefs?.lessonReminderMinutes ?? null,
    schoolMinutes: source.schoolMinutes,
    // Порядок каталога на экране кабинета — по названию; в снимке он по `id`,
    // чтобы два снимка одного состояния совпадали побайтно.
    classes: [...source.classes].sort((a, b) => byCodeUnits(a.id, b.id)),
  };
}

@Injectable()
export class ReminderSyncService {
  constructor(
    @InjectModel(NotificationPrefsRecord.name)
    private readonly prefsModel: Model<NotificationPrefsRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    private readonly settingsService: SettingsService,
  ) {}

  /** Только свой аккаунт: `accountId` приходит из сессии или bearer, а не из
   * запроса. Документ читается одним запросом с проекцией на нужные поля. */
  async getSnapshot(accountId: string): Promise<ReminderSyncSnapshot> {
    const [prefs, catalogue] = await Promise.all([
      this.prefsModel
        .findOne(
          { userId: accountId },
          {
            reminderClassIds: 1,
            reminderLessonIds: 1,
            reminderRevision: 1,
            lessonReminderMinutes: 1,
          },
        )
        .lean<StoredReminderPrefs | null>(),
      this.loadCatalogue(),
    ]);
    return toReminderSyncSnapshot({ accountId, prefs, ...catalogue });
  }

  /** Снимок по уже известному состоянию человека: после записи оно взято из
   * сохранённых значений, и перечитывать его вторым запросом нельзя — между
   * ними могла встать чужая запись. Каталог и школьные минуты — свежие. */
  async snapshotFor(
    accountId: string,
    prefs: StoredReminderPrefs | null,
  ): Promise<ReminderSyncSnapshot> {
    return toReminderSyncSnapshot({
      accountId,
      prefs,
      ...(await this.loadCatalogue()),
    });
  }

  private async loadCatalogue(): Promise<{
    schoolMinutes: number;
    classes: LessonScopeClassDto[];
  }> {
    const [classes, school] = await Promise.all([
      listLessonScopeClasses(this.classModel),
      this.settingsService.get(),
    ]);
    return { schoolMinutes: school.lessonReminderMinutes, classes };
  }
}
