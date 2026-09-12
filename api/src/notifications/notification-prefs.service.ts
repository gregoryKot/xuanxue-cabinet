// Настройки уведомлений (ТЗ notifications-api.md) — get() считает то, что
// реально придёт человеку сейчас (дефолт роли + overrides), set() —
// идемпотентный upsert одного переключателя. Отправки здесь нет — только
// хранение и чтение настройки, следующий PR добавляет доставку.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  defaultNotifications,
  type NotificationKind,
  type NotificationPrefsDto,
  type UserRole,
} from '@xuanxue/shared';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { applyOverrides } from './apply-overrides';
import { NotificationPrefsRecord } from './notification-prefs.schema';

// CAS-цикл set() ниже завершается за 1 итерацию почти всегда — второй виток
// нужен только настоящей гонке двух одновременных кликов (не мок — CLAUDE.md
// «Тесты»); 5 — запас на случай нескольких одновременных вкладок, не число
// «на глаз».
const SET_RETRY_LIMIT = 5;
const SET_RETRY_EXHAUSTED_MESSAGE =
  'Не получилось сохранить настройку — попробуйте ещё раз.';

type LeanPrefs = Pick<NotificationPrefsRecord, 'overrides'>;

@Injectable()
export class NotificationPrefsService {
  constructor(
    @InjectModel(NotificationPrefsRecord.name)
    private readonly model: Model<NotificationPrefsRecord>,
  ) {}

  async get(userId: string, roles: UserRole[]): Promise<NotificationPrefsDto> {
    const doc = await this.model.findOne({ userId }).lean<LeanPrefs | null>();
    return { enabled: applyOverrides(defaultNotifications(roles), doc?.overrides ?? []) };
  }

  /** Второе нажатие той же кнопки в боте ничего не ломает (ТЗ
   * notifications-api.md): апдейт существующего элемента overrides и
   * добавление нового различаются запросом (`overrides.kind` совпадает /
   * не совпадает с искомым) — если между этими двумя попытками другой
   * запрос успел вставить тот же kind (гонка двух кликов), обе попытки этой
   * итерации промахиваются мимо документа, и мы повторяем от начала:
   * конечный результат — один элемент с этим kind и последним enabled, без
   * дублей и без потери записи. */
  async set(userId: string, kind: NotificationKind, enabled: boolean): Promise<void> {
    for (let attempt = 0; attempt < SET_RETRY_LIMIT; attempt += 1) {
      await this.ensureDoc(userId);

      const updated = await this.model.updateOne(
        { userId, 'overrides.kind': kind },
        { $set: { 'overrides.$.enabled': enabled } },
      );
      if (updated.matchedCount > 0) return;

      const pushed = await this.model.updateOne(
        { userId, 'overrides.kind': { $ne: kind } },
        { $push: { overrides: { kind, enabled } } },
      );
      if (pushed.matchedCount > 0) return;
    }
    throw new Error(SET_RETRY_EXHAUSTED_MESSAGE);
  }

  /** Документ настроек почти всегда уже есть — создаём только при первом
   * переключении человека (тот же приём, что `SettingsService.get()`:
   * дешёвое чтение раньше записи, E11000 гонки двух первых кликов не роняет
   * второй, просто ничего не создаёт — документ уже есть после первого). */
  private async ensureDoc(userId: string): Promise<void> {
    const exists = await this.model.exists({ userId });
    if (exists) return;
    try {
      await this.model.create({ userId, overrides: [] });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
    }
  }
}
