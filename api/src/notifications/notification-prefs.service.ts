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
import { applyOverrides } from './apply-overrides';
import { ensurePrefsDoc } from './ensure-prefs-doc';
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

  /** То же, что `get()`, но для целого списка людей одним запросом — нужна
   * PersonalChats.listFor (ТЗ notifications-delivery.md §1): «не читай
   * настройки по одному человеку в цикле, одна выборка по списку userId».
   * Порядок и состав ключей результата — как во входном списке, включая
   * людей без документа (дефолт роли без overrides). */
  async getManyEnabled(
    users: readonly { id: string; roles: UserRole[] }[],
  ): Promise<Map<string, NotificationKind[]>> {
    if (users.length === 0) return new Map();
    const docs = await this.model
      .find({ userId: { $in: users.map((u) => u.id) } }, { userId: 1, overrides: 1 })
      .lean<(Pick<NotificationPrefsRecord, 'overrides'> & { userId: string })[]>();
    const overridesByUserId = new Map(docs.map((doc) => [doc.userId, doc.overrides]));
    return new Map(
      users.map((user) => [
        user.id,
        applyOverrides(
          defaultNotifications(user.roles),
          overridesByUserId.get(user.id) ?? [],
        ),
      ]),
    );
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
      await ensurePrefsDoc(this.model, userId);

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

  /** Свой день напоминания об оплате (ADR-0161) или `undefined` — «как у
   * школы». Отдельный метод, а не поле в `get()`: `NotificationPrefsDto` уходит
   * в кабинет и в бот, и лишнее поле поехало бы туда же. */
  async getPaymentReminderDay(userId: string): Promise<number | undefined> {
    const doc = await this.model
      .findOne({ userId }, { paymentReminderDay: 1 })
      .lean<Pick<NotificationPrefsRecord, 'paymentReminderDay'> | null>();
    return doc?.paymentReminderDay;
  }

  /** Дни целой пачки одним запросом (не по человеку в цикле, как
   * `getManyEnabled`): в карте только те, кто выбрал свой день. */
  async getPaymentReminderDays(userIds: readonly string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const docs = await this.model
      .find(
        { userId: { $in: [...userIds] }, paymentReminderDay: { $exists: true } },
        { userId: 1, paymentReminderDay: 1 },
      )
      .lean<Required<Pick<NotificationPrefsRecord, 'userId' | 'paymentReminderDay'>>[]>();
    return new Map(docs.map((doc) => [doc.userId, doc.paymentReminderDay]));
  }

  /** Записать свой день; `null` — снять выбор, «не напоминать» (`$unset`, а не 0:
   * ноль в поле означал бы «выбрал день 0»). Сброс документ не заводит: нечего
   * сбрасывать там, где ничего не выбирали. Запись идемпотентна — то же
   * значение второй раз даёт тот же документ. */
  async setPaymentReminderDay(userId: string, day: number | null): Promise<void> {
    if (day === null) {
      await this.model.updateOne({ userId }, { $unset: { paymentReminderDay: 1 } });
      return;
    }
    await ensurePrefsDoc(this.model, userId);
    await this.model.updateOne({ userId }, { $set: { paymentReminderDay: day } });
  }
}
