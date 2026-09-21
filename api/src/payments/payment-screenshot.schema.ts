// Байты снимка перевода (ADR-0050, docs/PLAN.md §15 слой 2.2) — запасной
// путь для того, чей Telegram с кабинетом не связан (`MeDto.telegramLinked
// === false`, вошёл по почте — ADR-0029/0034): бот его не узнаёт, и основной
// путь «фото боту» ему закрыт. Тот же приём, что у картинок вариантов ответа
// (ADR-0035): байты в самом документе, без GridFS — серверный потолок одного
// файла (`EXAM_IMAGE_LIMITS.maxBytes`, 1 МБ) много меньше 16 МБ на документ.
//
// `userId` у коллекции нет намеренно: чей снимок — знает оплата
// (`payments.screenshotImageId`), и второй ответ на тот же вопрос разъехался
// бы с первым. Поэтому в `USER_OWNED_COLLECTIONS` её нет, а удаление
// аккаунта уносит байты через `USER_OWNED_CASCADES`
// (users/user-data.registry.ts) — иначе снимок ученика пережил бы его
// аккаунт.
//
// retention (чеклист CLAUDE.md «Новая коллекция», ADR-0050): 30 дней
// после подтверждения оплаты и 90 дней после загрузки, если подтверждения
// так и не случилось. Считает и удаляет шаг тика
// (payment-screenshot-sweep.service.ts), не TTL-индекс Mongo: дата удаления
// зависит от статуса оплаты, а TTL умеет только «поле плюс константа».
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { EXAM_IMAGE_CONTENT_TYPES } from '@xuanxue/shared';
import type { ExamImageContentType } from '@xuanxue/shared';
import { type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'payment_screenshots' })
export class PaymentScreenshotRecord {
  // Зашифровано вручную (`encryptBytes`/`decryptBytes`,
  // utils/encryption-bytes.ts) в сервисе, не через encryptRecord — тот умеет
  // только строки верхнего уровня документа, не Buffer. На снимке перевода
  // имя, счёт и сумма (SECURITY §5).
  @Prop({ type: Buffer, required: true })
  bytes!: Buffer;

  // Те же три типа, что у картинок вариантов ответа: список допустимых
  // форматов в проекте один (SECURITY §4 — оба сырых маршрута принимают
  // image/jpeg|png|webp), и второй его копией мы бы только развели их.
  @Prop({ type: String, enum: EXAM_IMAGE_CONTENT_TYPES, required: true })
  contentType!: ExamImageContentType;

  // Размер исходного (незашифрованного) снимка: шифротекст длиннее на
  // IV/tag, а лимит и любые числа про объём базы должны говорить о размере
  // файла, а не о раскладке шифрования.
  @Prop({ type: Number, required: true })
  sizeBytes!: number;
}

export const PaymentScreenshotSchema = SchemaFactory.createForClass(
  PaymentScreenshotRecord,
);
// Чтение и срок хранения приходят сюда по `_id` из
// `payments.screenshotImageId`; по дате ищет только проход уборщика за
// байтами-сиротами (payment-screenshot-sweep.service.ts, `removeOrphans`).
PaymentScreenshotSchema.index({ createdAt: 1 });

// Решений для `fieldPolicy` не требует ни одно поле, и это не пропуск
// (гейт encryption-coverage.spec.ts): `contentType` — перечисление,
// `sizeBytes` — число, а `bytes` — Buffer, вне охвата String/Mixed; он
// шифруется явно `encryptBytes` в сервисе, и ротация ключа перешифровывает
// его отдельной строкой RUNBOOK §6.1.
export const PAYMENT_SCREENSHOT_FIELD_POLICY: FieldPolicy = {};
