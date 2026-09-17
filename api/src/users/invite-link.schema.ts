// Ссылка-приглашение школы (ADR-0030, решение владельца 2026-09-15): одна
// активная ссылка на школу, «создать новую» инвалидирует прежнюю — тот же
// механизм и есть отзыв при утечке (SECURITY §9). Коллекция держит не более
// одного документа: InviteLinkService.rotate() — deleteMany + create, не
// findOneAndUpdate (не плодим состояния «активна/отозвана» — правка кода
// проще одного факта «в коллекции либо пусто, либо один документ»).
//
// Не в USER_OWNED_COLLECTIONS (CLAUDE.md «Новая коллекция с userId»): это не
// данные пользователя, а настройка школы — у документа нет `userId`,
// `createdByUserId` только для журнала «кто создал», удаление аккаунта его
// не трогает (в отличие от USER_REFERENCE_PATHS, `createdByUserId` — не ref,
// а строка, как id из пути везде в проекте, SECURITY §3).
//
// retention: живёт до следующего rotate() — заменяется целиком, TTL не нужен.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { enc, encryptSchemaFrom, plain, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'invite_links' })
export class InviteLinkRecord {
  @Prop({ type: String, required: true })
  codeHash!: string;

  // Код нужен в открытом виде только затем, чтобы показать ссылку админу
  // (GET /users/invite-link) — capability-URL, шифруем как zoomLink
  // (CLAUDE.md «Безопасность», SECURITY §5).
  @Prop({ type: String, required: true })
  code!: string;

  @Prop({ type: String, required: true })
  createdByUserId!: string;
}

export const InviteLinkSchema = SchemaFactory.createForClass(InviteLinkRecord);

// codeHash — по построению уникален (sha256 разных случайных 16 байт), но
// unique — вторая линия обороны, тот же приём, что у email_login_tokens.
InviteLinkSchema.index({ codeHash: 1 }, { unique: true });

export const INVITE_LINK_FIELD_POLICY: FieldPolicy = {
  codeHash: plain('хеш, не восстанавливаемый текст, как tokenHash у email-login'),
  code: enc,
  createdByUserId: plain('кто создал ссылку — для журнала на «Людях», не секрет'),
};

/** Одна схема шифрования на все места чтения/записи (CLAUDE.md «Дубли»). */
export const INVITE_LINK_ENCRYPT_SCHEMA = encryptSchemaFrom(INVITE_LINK_FIELD_POLICY);
