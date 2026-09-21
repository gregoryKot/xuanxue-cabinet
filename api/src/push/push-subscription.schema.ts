// Подписка браузера на web push (ADR-0092, чеклист CLAUDE.md «Новая
// коллекция»). Данные человека, не школы (ADR-0010): у одного человека
// несколько устройств — телефон, ноутбук, — каждое своя запись.
//
// retention: живёт, пока жив аккаунт (в USER_OWNED_COLLECTIONS,
// user-data.registry.ts — DELETE /users/:id уносит её тем же путём, что
// NotificationPrefsRecord); удаление мёртвых подписок по ответу 404/410 от
// push-сервиса (браузер снесён или разрешение отозвано) —
// PushSenderService.sendOne (push-sender.service.ts).
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { enc, encryptSchemaFrom, plain, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'push_subscriptions' })
export class PushSubscriptionRecord {
  // Владение — строкой, не ObjectId: та же причина, что у
  // NotificationPrefsRecord.userId (notification-prefs.schema.ts, тот же
  // чеклист) — единственное сравнение всегда с UserLean.id из сессии,
  // который уже строка, кастовать туда и обратно незачем.
  @Prop({ type: String, required: true })
  userId!: string;

  // Адрес push-сервиса конкретного браузера — уникален, по нему идёт upsert
  // повторной подписки того же устройства (идемпотентность, CLAUDE.md
  // «Действие с побочным эффектом»). Не шифруется: по нему уникальный индекс
  // и точечный поиск при отписке (`{ endpoint, userId }`) — шифрование
  // недетерминированно (свежий IV на каждую запись), искать по шифротексту
  // нельзя. В логи всё равно не попадает — свой путь в redact-paths.ts.
  @Prop({ type: String, required: true })
  endpoint!: string;

  // Ключи шифрования содержимого push (RFC 8291) — секреты доставки, тот же
  // уровень, что токен канала (SECURITY §5): кто их знает, может слать
  // push-сообщения на это устройство от имени школы.
  //
  // Сейчас их не читает ни один код: тело push пустое (ADR-0092 «Решение»,
  // PushSenderService), а шифрование содержимого нужно только текстовому
  // push. Поле не мёртвое — хранится впрок: перевод на push с текстом не
  // потребует заново спрашивать разрешение у всех, ключи уже в базе. Удалять
  // нельзя, даже если knip или храповик когда-нибудь заметят, что их никто
  // не импортирует, — decryptPushSubscription (push-subscription.mapper.ts)
  // их читает ради read-after-write теста и как раз ради этого впрок.
  @Prop({ type: String, required: true })
  p256dh!: string;

  @Prop({ type: String, required: true })
  auth!: string;
}

export const PushSubscriptionSchema =
  SchemaFactory.createForClass(PushSubscriptionRecord);
// Уникальность + идемпотентность повторной подписки того же устройства
// (ADR-0092): второй POST с тем же endpoint обновляет запись, не плодит
// вторую. Общий ноутбук, второй человек подписался тем же браузером —
// upsert по этому индексу обязан переписать userId (push-subscriptions.service.ts).
PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
// Удаление аккаунта (USER_OWNED_COLLECTIONS) чистит по userId — без индекса
// это скан всей коллекции на каждое удаление человека.
PushSubscriptionSchema.index({ userId: 1 });

export const PUSH_SUBSCRIPTION_FIELD_POLICY: FieldPolicy = {
  userId: plain('id пользователя из сессии — признак владения, не свободный текст'),
  endpoint: plain(
    'ключ уникального индекса и точка поиска при отписке — шифрование недетерминированно, искать по шифротексту нельзя; сам адрес push-сервиса не секрет школы (SECURITY §1), но в логи не попадает (redact-paths.ts)',
  ),
  p256dh: enc,
  auth: enc,
};

/** Схема шифрования записи — одна на запись (push-subscriptions.service.ts)
 * и на чтение (push-subscription.mapper.ts): читающий мимо неё получит
 * шифротекст вместо ключа доставки. Тот же приём, что EXAM_IMAGE_ENCRYPT_SCHEMA. */
export const PUSH_SUBSCRIPTION_ENCRYPT_SCHEMA = encryptSchemaFrom(
  PUSH_SUBSCRIPTION_FIELD_POLICY,
);
