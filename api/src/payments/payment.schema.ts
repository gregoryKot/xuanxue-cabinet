// Абонемент по месяцам (docs/PLAN.md §15, ADR-0049) — данные ученика
// (ADR-0010 наоборот: не занятие/канал школы, а деньги конкретного
// человека), чеклист CLAUDE.md «Новая коллекция с полем userId» целиком.
// Срок хранения — пока жив аккаунт: финансовый след школы, не свободный
// текст — уносит его `deleteAllUserData` по `USER_OWNED_COLLECTIONS` вместе
// с остальными данными человека (ADR-0049 «Последствия»).
//
// Поля скриншота (screenshotKind/…FileId/…FileUniqueId/…At) пишет путь бота
// (слой 2.2, ADR-0050): `attachTelegramScreenshot` в payments.write.ts.
// `screenshotImageId` ждёт второго пути — загрузки в кабинете; он заведён
// заранее, чтобы схема не менялась ещё раз.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { PAYMENT_STATUSES } from '@xuanxue/shared';
import type { PaymentStatus } from '@xuanxue/shared';
import { USER_MODEL_NAME } from '../users/user-data.registry';
import { enc, plain, encryptSchemaFrom, type FieldPolicy } from '../common/field-policy';

// Источник скриншота (ADR-0050) — бот (file_id Telegram) или загрузка в
// кабинете (payment_screenshots, следующий PR). Список закрыт здесь же, не в
// shared: наружу (DTO) поле не идёт ни в одном эндпоинте — снаружи видно
// только `hasScreenshot`.
const PAYMENT_SCREENSHOT_KINDS = ['telegram', 'upload'] as const;
type PaymentScreenshotKind = (typeof PAYMENT_SCREENSHOT_KINDS)[number];

/** Источник скриншота из бота (payments.write.ts, attachTelegramScreenshot) —
 * та же форма, что `PaymentScreenshotSource` в telegram/handlers/
 * payment-screenshot-source.ts. Телеграм-слой сюда не импортируется:
 * структурная совместимость типов делает своё дело, тем же приёмом, что
 * `TelegramVideoSource` у media_assets. */
export interface TelegramScreenshotSource {
  fileId: string;
  fileUniqueId: string;
}

@Schema({ timestamps: true, collection: 'payments' })
export class PaymentRecord {
  // Владение (чеклист CLAUDE.md, п.1) — чей абонемент. Без `ref`, как
  // userId у media_assets: признак владения, не связь для populate.
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId!: Types.ObjectId;

  // 'YYYY-MM' в поясе школы (ADR-0049, MONTH_KEY_RE) — ключ уникального
  // индекса, не Date: абонемент на календарный месяц целиком, школа не
  // продаёт «месяц с 15-го по 14-е».
  @Prop({ type: String, required: true })
  month!: string;

  @Prop({ type: String, enum: PAYMENT_STATUSES, default: 'unpaid' })
  status!: PaymentStatus;

  // Целое число агорот (ADR-0049) — необязательно: отметить оплату можно
  // без суммы, вводить её ради галочки не нужно.
  @Prop({ type: Number, required: false })
  amountMinor?: number;

  // Кто подтвердил — не признак владения (см. USER_REFERENCE_PATHS,
  // user-data.registry.ts): удаление аккаунта бухгалтера обнуляет поле,
  // сама оплата остаётся.
  @Prop({ type: SchemaTypes.ObjectId, required: false, ref: USER_MODEL_NAME })
  confirmedBy?: Types.ObjectId;

  @Prop({ type: Date, required: false })
  confirmedAt?: Date;

  // Источник скриншота (ADR-0050) — бот или загрузка, см. перечисление выше.
  @Prop({ type: String, enum: PAYMENT_SCREENSHOT_KINDS, required: false })
  screenshotKind?: PaymentScreenshotKind;

  // Ведёт к фото в Telegram — шифруем (SECURITY §5), как fileId/fileUniqueId
  // видео экзамена (media-asset.schema.ts).
  @Prop({ type: String, required: false })
  screenshotFileId?: string;

  @Prop({ type: String, required: false })
  screenshotFileUniqueId?: string;

  // Ссылка на payment_screenshots (kind: 'upload') — открытым ObjectId, не
  // шифруем: уборщик скриншотов (ADR-0050) ищет по нему, шифрование спрятало
  // бы запись от собственного запроса.
  @Prop({ type: SchemaTypes.ObjectId, required: false })
  screenshotImageId?: Types.ObjectId;

  // Когда прислали — от него считается срок хранения без подтверждения
  // (ADR-0050: 90 дней без подтверждения, 30 дней после).
  @Prop({ type: Date, required: false })
  screenshotAt?: Date;

  // claimOnce-поле напоминания (ADR-0051, слой 2.5, следующий PR) —
  // условный апдейт ДО отправки: второй тик в ту же минуту не шлёт второе
  // сообщение.
  @Prop({ type: Date, required: false })
  reminderSentAt?: Date;

  // Свободный текст бухгалтера — шифруем.
  @Prop({ type: String, required: false })
  note?: string;
}

export const PaymentSchema = SchemaFactory.createForClass(PaymentRecord);

// Один абонемент на месяц (ADR-0049) — та же граница защищает от второго
// скриншота и от двойного клика «Подтвердить».
PaymentSchema.index({ userId: 1, month: 1 }, { unique: true });
// Список месяца для экрана «Оплаты» (GET /payments?month=).
PaymentSchema.index({ month: 1, status: 1 });
// Отдельного индекса по одному `userId` нет: выборки по владельцу (свои
// месяцы, `deleteAllUserData` по USER_OWNED_COLLECTIONS) обслуживает префикс
// уникального (userId, month) выше — второй индекс стоил бы записи на каждом
// сохранении и не дал бы ничего.

export const PAYMENT_FIELD_POLICY: FieldPolicy = {
  month: plain('ключ выборок и уникального индекса, не свободный текст (SECURITY §5)'),
  screenshotKind: plain('перечисление источника скриншота, нужно для выборок'),
  screenshotFileId: enc,
  screenshotFileUniqueId: enc,
  note: enc,
};

/** Схема шифрования оплат — одна на все места чтения и записи
 * (payments.write.ts/payments.queries.ts): читающий запись мимо неё получит
 * шифротекст вместо screenshotFileId/screenshotFileUniqueId/note. */
export const PAYMENT_ENCRYPT_SCHEMA = encryptSchemaFrom(PAYMENT_FIELD_POLICY);
