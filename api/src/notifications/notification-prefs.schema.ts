// Настройки уведомлений — данные человека (ADR-0010), вторая коллекция с
// userId в проекте после попыток экзамена (чеклист CLAUDE.md «Новая
// коллекция с полем userId», ТЗ notifications-api.md). Хранится только то,
// что человек тронул руками (`overrides`) — то, что не тронул, каждый раз
// считается заново из `DEFAULT_NOTIFICATIONS_BY_ROLE`
// (`defaultNotifications`, shared/src/notifications.ts): новый вид
// уведомления подхватывается всеми молча, без миграции старых документов.
// Срок хранения — пока жив аккаунт: `DELETE /users/:id` удаляет документ
// целиком через `USER_OWNED_COLLECTIONS` (docs/PLAN.md §4).
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { NOTIFICATION_KINDS } from '@xuanxue/shared';
import type { NotificationKind } from '@xuanxue/shared';
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
}

export const NotificationPrefsSchema = SchemaFactory.createForClass(
  NotificationPrefsRecord,
);
// Один документ настроек на человека — второй insert с тем же userId падает
// с E11000 (NotificationPrefsService.ensureDoc ловит и не создаёт дубль).
NotificationPrefsSchema.index({ userId: 1 }, { unique: true });

export const NOTIFICATION_PREFS_FIELD_POLICY: FieldPolicy = {
  userId: plain('id пользователя — признак владения, не свободный текст'),
};
