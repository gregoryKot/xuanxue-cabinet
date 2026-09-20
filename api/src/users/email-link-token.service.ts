// Выпуск и потребление одноразового токена подтверждения привязки почты
// (ADR-0059, ../auth/email-link.service.ts) — тот же приём, что у
// TelegramLinkCodeService: в базе только sha256(token)
// (email-link-token.schema.ts), сырой токен возвращается наружу один раз,
// при issue(), и живёт дальше только в письме. Время — параметром (CLAUDE.md
// «Время»), не Date.now()/DateTime.utc() внутри сервиса.
import { createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import { EmailLinkTokenRecord } from './email-link-token.schema';

// Час, не 15 минут, как у ссылки входа (EMAIL_LOGIN_TOKEN_TTL_MIN, ../auth/
// email-login-token.service.ts): ссылку входа человек ждёт прямо сейчас,
// подтверждение почты — попутное дело, и цена протухшего токена здесь —
// нажать «Прислать ссылку ещё раз» на «Профиле», а не потерянный вход.
export const EMAIL_CONFIRM_TOKEN_TTL_MIN = 60;

// Потолок повторных писем на ОДИН и тот же адрес. Нужен из-за квоты Resend
// (100 писем в сутки на бесплатном тарифе, RUNBOOK §5): троттлинг по IP
// пропускает 5 нажатий в минуту, то есть «Прислать ссылку ещё раз» выжигает
// суточную квоту минут за двадцать — и вход по почте ломается у всей школы,
// не только у нажимавшего. Отказ при этом честный, а не молчаливый, как
// cooldown письма входа (EMAIL_LOGIN_RESEND_COOLDOWN_MIN): там ответ обязан
// скрывать, есть ли аккаунт, а здесь спрашивает сам владелец адреса —
// EmailLinkService отвечает ему EMAIL_CONFIRM_RESEND_TOO_SOON_MESSAGE.
export const EMAIL_CONFIRM_RESEND_COOLDOWN_MIN = 2;

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

  /** Сырой токен для ссылки в письме — `null`, если этому человеку на ТОТ ЖЕ
   * адрес письмо ушло меньше EMAIL_CONFIRM_RESEND_COOLDOWN_MIN назад
   * (вызывающий отвечает отказом с текстом, см. константу выше). Кулдаун
   * смотрит на адрес, а не только на человека: сменить адрес — другое
   * намерение, не повтор, и ждать там нечего. Прежние токены этого человека
   * удаляются перед вставкой нового — активная ссылка подтверждения всегда
   * одна (тот же приём, что у TelegramLinkCodeService.issueLink). */
  async issue(userId: string, email: string, now: DateTime): Promise<string | null> {
    // Не Mongoose-таймстамп createdAt: он пишется системным временем, а не
    // переданным `now`, и под управляемым временем теста кулдаун никогда не
    // срабатывал бы. issuedAt восстанавливаем из expiresAt, который сами и
    // пишем ниже (тот же приём, что в EmailLoginTokenService.issue).
    const last = await this.model
      .findOne({ userId }, { expiresAt: 1, email: 1 })
      .sort({ expiresAt: -1 })
      .lean<{ expiresAt: Date; email: string } | null>();
    if (last && last.email === email && isWithinCooldown(last.expiresAt, now)) {
      return null;
    }

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

function isWithinCooldown(lastExpiresAt: Date, now: DateTime): boolean {
  const issuedAt = DateTime.fromJSDate(lastExpiresAt).minus({
    minutes: EMAIL_CONFIRM_TOKEN_TTL_MIN,
  });
  return now.diff(issuedAt, 'minutes').minutes < EMAIL_CONFIRM_RESEND_COOLDOWN_MIN;
}
