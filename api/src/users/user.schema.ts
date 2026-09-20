// Пользователь кабинета — единственный путь к сессии (ADR-0005, ADR-0012).
// Ключи входа (email, telegramId, googleId) — частичные уникальные индексы,
// не sparse (образец — broadcast.schema.ts): документ без значения поля не
// занимает ключ, два документа с одинаковым значением падают на E11000
// (model.registry.spec.ts).
//
// retention: коллекция живёт, пока жив аккаунт — полное удаление идёт через
// UserDeletionService.deleteAllUserData (CLAUDE.md «Персональные данные
// учеников», DELETE /users/:id, аудит В11), отдельного TTL нет.
// telegramId — Number, не String/Mixed, в USER_FIELD_POLICY (шифрование) не
// попадает — но это PII и ключ входа, причина фиксируется здесь, а не в policy.
// lastLoginAt — Date, та же причина не попасть в USER_FIELD_POLICY; нужен для
// отзыва неактивных аккаунтов (срок пересмотреть на этапе 2 — сейчас поле
// только пишется, автоматического отзыва ещё нет).
// profileNamedAt — тоже Date, та же причина не попасть в USER_FIELD_POLICY
// (не свободный текст): момент, когда человек сам назвал себя на экране
// `/welcome` (ADR-0044, PATCH /me/profile, UserProfileService.setName).
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  USER_ROLES,
  USER_STATUSES,
  type UserRole,
  type UserStatus,
} from '@xuanxue/shared';
import { plain, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'users' })
export class UserRecord {
  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: false, lowercase: true })
  email?: string;

  @Prop({ type: Number, required: false })
  telegramId?: number;

  @Prop({ type: String, required: false })
  googleId?: string;

  // Форма [{ type: String, enum }], не [String] с enum рядом: у такого пути
  // getEmbeddedSchemaType() отдаёт SchemaType с options.enum на элементе, и
  // encryption-coverage.spec (isEnumPath) видит перечисление, а не свободный
  // текст.
  @Prop({ type: [{ type: String, enum: USER_ROLES }], default: [] })
  roles!: UserRole[];

  @Prop({ type: String, enum: USER_STATUSES, default: 'active' })
  status!: UserStatus;

  @Prop({ type: Date, required: false })
  lastLoginAt?: Date;

  // Первый вход прошёл по ссылке-приглашению школы (ADR-0030, ADR-0036) —
  // без ссылки регистрация невозможна вовсе, но не у всех active она есть:
  // бутстрап-админ и человек, которого завели до этой миграции (0007), поле
  // не пишут. Date, не Boolean: момент нужен для журнала, а факт «есть
  // значение» уже даёт булево joinedViaInvite в UserDto (user.mapper.ts).
  // Не ПДн — не в USER_FIELD_POLICY, та же причина, что у lastLoginAt выше.
  @Prop({ type: Date, required: false })
  joinedViaInviteAt?: Date;

  // Человек назвал себя сам — экран `/welcome`, PATCH /me/profile (ADR-0044,
  // UserProfileService.setName). Date, не Boolean: та же причина, что у
  // lastLoginAt/joinedViaInviteAt выше — момент нужен для миграции 0009
  // (кому уже не задавать вопрос повторно), а факт «есть значение» даёт
  // булево MeDto.needsProfile (auth/user.mapper.ts). Пусто у всех, кто вошёл
  // до этого PR, — миграция 0009 проставляет его тем, чьё имя уже настоящее.
  @Prop({ type: Date, required: false })
  profileNamedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(UserRecord);

UserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
);
UserSchema.index(
  { telegramId: 1 },
  { unique: true, partialFilterExpression: { telegramId: { $type: 'number' } } },
);
UserSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } },
);

export const USER_FIELD_POLICY: FieldPolicy = {
  name: plain('показывается учителю и админу, подстановка «{ведущий}»'),
  email: plain('ключ поиска при входе, не свободный текст'),
  googleId: plain('ключ входа от Google, непрозрачный id, не секрет'),
};
