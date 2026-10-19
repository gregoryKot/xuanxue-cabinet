// Настройки уведомлений — данные человека (ADR-0010), вторая коллекция с
// userId в проекте после попыток экзамена (чеклист CLAUDE.md «Новая
// коллекция с полем userId», ТЗ notifications-api.md). Хранится только то,
// что человек тронул руками (`overrides`) — то, что не тронул, каждый раз
// считается заново из `DEFAULT_NOTIFICATIONS_BY_ROLE`
// (`defaultNotifications`, shared/src/notifications.ts): новый вид
// уведомления подхватывается всеми молча, без миграции старых документов.
// Срок хранения — пока жив аккаунт: `DELETE /users/:id` удаляет документ
// целиком через `USER_OWNED_COLLECTIONS` (docs/PLAN.md §4). Кроме переключателей
// здесь же выбор «о каких занятиях» (`lessonScopeMode`, `lessonClassIds`,
// ADR-0162), своё «за сколько напомнить о занятии» (`lessonReminderMinutes`,
// ADR-0162) и свой день напоминания об оплате (`paymentReminderDay`, ADR-0161).
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  LESSON_SCOPE_MODES,
  NOTIFICATION_KINDS,
  REMINDER_SYNC_LEAD_CHOICES,
  SETTINGS_LIMITS,
} from '@xuanxue/shared';
import type { LessonScopeMode, NotificationKind } from '@xuanxue/shared';
import { plain, type FieldPolicy } from '../common/field-policy';

// Подсхема одного переключателя — не Mixed (CLAUDE.md: Mixed только с
// причиной, здесь причины нет — форма постоянная, ровно два поля).
@Schema({ _id: false })
class NotificationOverrideSubdoc {
  @Prop({ type: String, enum: NOTIFICATION_KINDS, required: true })
  kind!: NotificationKind;

  @Prop({ type: Boolean, required: true })
  enabled!: boolean;
}
const NotificationOverrideSchema = SchemaFactory.createForClass(
  NotificationOverrideSubdoc,
);

@Schema({ timestamps: true, collection: 'notification_prefs' })
export class NotificationPrefsRecord {
  // Владение (чеклист CLAUDE.md, п.1) — строкой, не ObjectId: единственное
  // использование поля во всех запросах сервиса — точное совпадение с
  // `UserLean.id` из сессии, который уже строка; кастовать туда и обратно
  // незачем ни разу.
  @Prop({ type: String, required: true })
  userId!: string;

  @Prop({ type: [NotificationOverrideSchema], default: [] })
  overrides!: NotificationOverrideSubdoc[];

  // Свой день напоминания об оплате, 1–31 (ADR-0161). Нет поля — ученик
  // ничего не выбирал или снял выбор, и напоминание ему не приходит: общего
  // дня у школы нет. Отдельное поле, а не элемент overrides:
  // overrides — переключатели «вкл/выкл» по виду уведомления, число в них не
  // влезает. Диапазон держит DTO записи; в схеме — тот же min/max на случай
  // записи мимо DTO.
  @Prop({
    type: Number,
    min: SETTINGS_LIMITS.paymentReminderDayMin,
    max: SETTINGS_LIMITS.paymentReminderDayMax,
  })
  paymentReminderDay?: number;

  // О каких занятиях напоминать (ADR-0162). Два верхнеуровневых поля, а не
  // вложенный объект: политика шифрования читает только верхний уровень
  // (field-policy.ts). Нет `lessonScopeMode` — `all`: ученик ничего не
  // выбирал, документ ему не нужен.
  @Prop({ type: String, enum: LESSON_SCOPE_MODES })
  lessonScopeMode?: LessonScopeMode;

  // id занятий строками, как `userId`: сверяются с `classes._id.toString()`
  // в напоминании, кастовать туда и обратно незачем. Режим `all` список не
  // стирает — вернулся к `selected`, галочки на месте. `default: undefined`:
  // Mongoose иначе подставил бы пустой массив каждому документу настроек.
  @Prop({ type: [String], default: undefined })
  lessonClassIds?: string[];

  // Своё «за сколько минут напомнить о занятии» (ADR-0162). Нет поля — «как в
  // школе» (`settings.lessonReminderMinutes`): человек ничего не выбирал или
  // снял выбор. Отдельное поле, как `paymentReminderDay`: число не влезает в
  // overrides. Значения — только из короткого списка (`0` — «не напоминать»);
  // `enum` ловит запись через `create`/`save`, а запись через API держат DTO и
  // разбор тела записи (updateOne валидаторы схемы не запускает).
  @Prop({ type: Number, enum: REMINDER_SYNC_LEAD_CHOICES })
  lessonReminderMinutes?: number;

  // Выбор для синхронизации напоминаний с приложением Daychi (ADR-0185): о каких
  // занятиях расписания и о каких отдельных занятиях. `default: undefined` по
  // той же причине, что у `lessonClassIds` — пустой массив каждому документу
  // настроек не нужен; нет поля — пусто.
  @Prop({ type: [String], default: undefined })
  reminderClassIds?: string[];

  @Prop({ type: [String], default: undefined })
  reminderLessonIds?: string[];

  // Счётчик изменений выбора: клиент по нему отличает свежий снимок от
  // устаревшего. Нет поля — 0, выбор ещё не менялся.
  @Prop({ type: Number, min: 0 })
  reminderRevision?: number;
}

export const NotificationPrefsSchema = SchemaFactory.createForClass(
  NotificationPrefsRecord,
);
// Один документ настроек на человека — второй insert с тем же userId падает
// с E11000 (ensurePrefsDoc ловит и не создаёт дубль).
NotificationPrefsSchema.index({ userId: 1 }, { unique: true });

export const NOTIFICATION_PREFS_FIELD_POLICY: FieldPolicy = {
  userId: plain('id пользователя — признак владения, не свободный текст'),
  paymentReminderDay: plain(
    'число 1–31, выбранный день месяца, не свободный текст и не персональные данные',
  ),
  lessonScopeMode: plain('перечисление all/selected, не свободный текст'),
  lessonClassIds: plain(
    'id занятий расписания школы, не свободный текст и не персональные данные',
  ),
  lessonReminderMinutes: plain(
    'число из короткого списка 0/15/30/60/120, не свободный текст и не персональные данные',
  ),
  reminderClassIds: plain(
    'id занятий расписания школы, не свободный текст и не персональные данные',
  ),
  reminderLessonIds: plain(
    'id отдельных занятий школы, не свободный текст и не персональные данные',
  ),
  reminderRevision: plain(
    'счётчик изменений выбора, не свободный текст и не персональные данные',
  ),
};
