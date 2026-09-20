// Журнал «этот объект надо убрать из хранилища, если на него не появится
// ссылка» (ADR-0079, уточняет ADR-0057). Запись делается ДО того, как объект
// появится в R2, и снимается, когда на него сослался материал, — иначе
// объект, переживший падение между `PUT` и записью в Mongo, не находится
// ничем: ключ неугадываемый и нигде не записан.
//
// Данных пользователя здесь нет (ключ и дата), в USER_OWNED_COLLECTIONS
// коллекции делать нечего — user-data.registry.ts.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { plain, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'storage_orphans' })
export class StorageOrphanRecord {
  @Prop({ type: String, required: true })
  key!: string;
}

export const StorageOrphanSchema = SchemaFactory.createForClass(StorageOrphanRecord);
// Уникальность ключа делает повторную запись безобидной: журналу всё равно,
// сколько раз его попросили убрать один и тот же объект (ADR-0079).
StorageOrphanSchema.index({ key: 1 }, { unique: true });
// Уборщик берёт самые старые записи — `createdAt` из timestamps.
StorageOrphanSchema.index({ createdAt: 1 });

export const STORAGE_ORPHAN_FIELD_POLICY: FieldPolicy = {
  key: plain('ключ объекта в хранилище — служебный адрес, не персональные данные'),
};
