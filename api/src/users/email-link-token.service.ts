// Выпуск и потребление одноразового токена подтверждения привязки почты
// (ADR-0059, ../auth/email-link.service.ts) — тот же приём, что у
// TelegramLinkCodeService: в базе только sha256(token)
// (email-link-token.schema.ts), сырой токен возвращается наружу один раз,
// при issue(), и живёт дальше только в письме. Время — параметром (CLAUDE.md
// «Время»), не Date.now()/DateTime.utc() внутри сервиса.
import { createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import { EmailLinkTokenRecord } from './email-link-token.schema';

// Час, не 15 минут, как у ссылки входа (EMAIL_LOGIN_TOKEN_TTL_MIN, ../auth/
// email-login-token.service.ts): ссылку входа человек ждёт прямо сейчас,
// подтверждение почты — попутное дело, и цена протухшего токена здесь —
// нажать «Прислать ссылку ещё раз» на «Профиле», а не потерянный вход.
export const EMAIL_CONFIRM_TOKEN_TTL_MIN = 60;

export interface EmailLinkTokenOwner {
  userId: string;
  email: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class EmailLinkTokenService {
  constructor(
    @InjectModel(EmailLinkTokenRecord.name)
    private readonly model: Model<EmailLinkTokenRecord>,
  ) {}

  /** Сырой токен для ссылки в письме. Прежние токены этого человека удаляются
   * перед вставкой нового — активная ссылка подтверждения всегда одна (тот
   * же приём, что у TelegramLinkCodeService.issueLink). */
  async issue(userId: string, email: string, now: DateTime): Promise<string> {
    await this.model.deleteMany({ userId });

    const token = randomBytes(32).toString('hex');
    await this.model.create({
      userId,
      email,
      tokenHash: hashToken(token),
      expiresAt: now.plus({ minutes: EMAIL_CONFIRM_TOKEN_TTL_MIN }).toJSDate(),
    });
    return token;
  }

  /** Владелец токена — `null`, если токен неизвестен, просрочен или уже
   * использован (один и тот же ответ на все три причины, SECURITY §2).
   * Одноразовость — через саму операцию findOneAndDelete: второй вызов с тем
   * же токеном документа не находит. */
  async consume(token: string, now: DateTime): Promise<EmailLinkTokenOwner | null> {
    const doc = await this.model
      .findOneAndDelete({
        tokenHash: hashToken(token),
        expiresAt: { $gt: now.toJSDate() },
      })
      .lean<{ userId: Types.ObjectId; email: string } | null>();
    return doc ? { userId: doc.userId.toString(), email: doc.email } : null;
  }
}
