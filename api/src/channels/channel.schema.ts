// Канал рассылки (данные школы, ADR-0010): Telegram, ВК, ручной режим для
// Facebook. `config` — токен/chatId, зашифрован целиком как JSON и никогда
// не покидает сервер (ни в одном toDto, ни для одной роли — SECURITY §3).
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { CHANNEL_TYPES, type ChannelType } from '@xuanxue/shared';
import { encJson, plain, type FieldPolicy } from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';

@Schema({ timestamps: true, collection: 'channels' })
export class ChannelRecord {
  @Prop({ type: String, enum: CHANNEL_TYPES, required: true })
  type!: ChannelType;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: true })
  config!: string;

  @Prop({ type: Boolean, default: true })
  active!: boolean;

  // Адрес назначения без секрета: chatId телеграма, String(peerId) ВК, ''
  // для ручного канала. `config` зашифрован недетерминированно (encJson) —
  // искать по нему нельзя, а бот (api/src/telegram/, ADR-0015) при
  // добавлении в группу находит или создаёт канал по chatId идемпотентно
  // (ChannelConfigService.upsertTelegramChat). Заполняется сервисом из config
  // при create/update — одна функция targetOf (channel.mapper.ts).
  @Prop({ type: String, default: '' })
  target!: string;

  // Личный канал ОДНОГО человека, не канал школы (ADR-0027): личный чат
  // ученика после /start попадает в `channels` тем же типом telegram, чтобы
  // PersonalChats.chatFor() находил его для точечного уведомления (результат
  // экзамена и т. п.), но НЕ должен стать получателем рассылок занятий и НЕ
  // должен попасть на экран «Каналы» — иначе бот случайно разошлёт всей
  // школе то, что предназначено одному ученику, и учитель увидит в списке
  // каналов личные чаты чужих учеников. `false` — только у такого канала;
  // у канала школы (группа/канал, личный чат штата — тот получает всё
  // расписание, ADR-0015) поле не задаётся явно, default true — прежнее
  // поведение, миграция не нужна: `{ $ne: false }` матчит и документы без
  // поля (ChannelsService.list, ClassesService.defaultTelegramChannelIds).
  @Prop({ type: Boolean, default: true })
  broadcastEligible!: boolean;

  // См. USER_REFERENCE_PATHS.
  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: false })
  createdBy?: Types.ObjectId;
}

export const ChannelSchema = SchemaFactory.createForClass(ChannelRecord);
ChannelSchema.index({ type: 1 });
// Второй канал того же типа с тем же адресом не создаётся дважды —
// идемпотентность upsertTelegramChat и защита от дубля при ручном создании.
// Частичный: у ручного канала target === '' и дублей не считает (иначе все
// manual-каналы конкурировали бы за один слот индекса).
ChannelSchema.index(
  { type: 1, target: 1 },
  { unique: true, partialFilterExpression: { target: { $gt: '' } } },
);

export const CHANNEL_FIELD_POLICY: FieldPolicy = {
  title: plain('название для админа в кабинете, не секрет'),
  config: encJson,
  target: plain(
    'адрес назначения без секрета: по нему бот находит канал, когда его добавили в группу; chatId/peerId не секреты — SECURITY §3',
  ),
};
