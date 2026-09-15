// Ссылка-приглашение школы (ADR-0030): единственная точка чтения/записи
// InviteLinkRecord — контроллер и JoinByInviteService (api/src/auth/) не
// лезут в Mongoose напрямую (CLAUDE.md). PUBLIC_URL — тот же адрес кабинета,
// что строит письма входа (ADR-0009-доп., ADR-0029), не адрес сайта школы
// из настроек (тот — schoolSiteUrl, другое поле).
import { createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  INVITE_CODE_RE,
  INVITE_LINK_NOT_AVAILABLE_MESSAGE,
  type InviteLinkDto,
} from '@xuanxue/shared';
import { NotAvailableError } from '../common/errors';
import { decryptRecord, encryptRecord } from '../utils/encryption';
import { INVITE_LINK_ENCRYPT_SCHEMA, InviteLinkRecord } from './invite-link.schema';

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

@Injectable()
export class InviteLinkService {
  constructor(
    private readonly config: ConfigService,
    @InjectModel(InviteLinkRecord.name)
    private readonly model: Model<InviteLinkRecord>,
  ) {}

  /** `url: null` — ссылку ещё ни разу не создавали, `PUBLIC_URL` не задан —
   * `NotAvailableError` (видит только admin на «Людях», CLAUDE.md
   * «Конфигурация»: без адреса сайта ссылку всё равно не собрать). */
  async getCurrent(): Promise<InviteLinkDto> {
    const publicUrl = this.requirePublicUrl();
    const doc = await this.model.findOne({}).lean<{ code: string } | null>();
    if (!doc) return { url: null };
    const { code } = decryptRecord(doc, INVITE_LINK_ENCRYPT_SCHEMA);
    return { url: `${publicUrl}/join/${code}` };
  }

  /** «Создать новую» = `deleteMany` + `create`, не правка старого документа
   * (комментарий в invite-link.schema.ts) — прежний код сразу перестаёт
   * проходить `isValid()`, это и есть отзыв при утечке (SECURITY §9). */
  async rotate(adminUserId: string): Promise<InviteLinkDto> {
    const publicUrl = this.requirePublicUrl();
    const code = randomBytes(16).toString('hex');
    await this.model.deleteMany({});
    await this.model.create(
      encryptRecord(
        { codeHash: hashCode(code), code, createdByUserId: adminUserId },
        INVITE_LINK_ENCRYPT_SCHEMA,
      ),
    );
    return { url: `${publicUrl}/join/${code}` };
  }

  /** По хешу — сырой код в базе не хранится дольше, чем нужно на один
   * запрос (тот же приём, что у email_login_tokens). Формат сверяется
   * заранее — DTO уже валидирует его `@Matches`, здесь вторая линия обороны
   * для внутренних вызовов (join-by-invite.service.ts). */
  async isValid(code: string): Promise<boolean> {
    if (!INVITE_CODE_RE.test(code)) return false;
    const found = await this.model.exists({ codeHash: hashCode(code) });
    return found !== null;
  }

  private requirePublicUrl(): string {
    const publicUrl = this.config.get<string>('PUBLIC_URL');
    if (!publicUrl) throw new NotAvailableError(INVITE_LINK_NOT_AVAILABLE_MESSAGE);
    return publicUrl;
  }
}
