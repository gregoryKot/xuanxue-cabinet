// Выпуск и потребление одноразового токена входа по email (SECURITY §2,
// ADR-0029). В базе — только sha256(token) (email-login-token.schema.ts);
// сырой токен возвращается наружу один раз, при issue(), и живёт дальше
// только в письме и в адресной строке. Время — параметром (CLAUDE.md
// «Время»), не Date.now()/DateTime.utc() внутри сервиса.
import { createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Model } from 'mongoose';
import { EmailLoginTokenRecord } from './email-login-token.schema';

// Не env (в отличие от TTL сессии, ADR-0012) — время жизни ссылки входа не
// настройка школы, менять его в интерфейсе некому и незачем (CLAUDE.md
// «Кабинет учителя»: в env — только секреты и инфраструктура).
export const EMAIL_LOGIN_TOKEN_TTL_MIN = 15;
// Анти-спам (SECURITY §2): issue() не шлёт второе письмо тому же адресу
// раньше этого срока — отдельно от троттлинга по IP в auth.controller.ts,
// который не защищает от одного адресата с разных IP.
export const EMAIL_LOGIN_RESEND_COOLDOWN_MIN = 2;
// Формат randomBytes(32).toString('hex') — 64 hex-символа, используется и в
// VerifyEmailLoginDto (verify-email-login.dto.ts).
export const EMAIL_LOGIN_TOKEN_RE = /^[0-9a-f]{64}$/;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class EmailLoginTokenService {
  constructor(
    @InjectModel(EmailLoginTokenRecord.name)
    private readonly model: Model<EmailLoginTokenRecord>,
  ) {}

  /** Сырой токен для ссылки — `null`, если этому email только что (меньше
   * EMAIL_LOGIN_RESEND_COOLDOWN_MIN назад) уже отправляли письмо: вызывающий
   * код (EmailAuthService) тогда не шлёт письмо второй раз, но отвечает
   * клиенту так же, как при успехе — существование аккаунта не раскрываем
   * (SECURITY §2). Прежние токены этого email удаляются перед вставкой
   * нового: новый запрос инвалидирует прежнюю ссылку, а не плодит их
   * параллельно. */
  async issue(email: string, now: DateTime): Promise<string | null> {
    // Не Mongoose-таймстамп createdAt: он пишется реальным системным временем
    // (timestamps: true), а не переданным `now` — под управляемым временем
    // теста (email-login-token.service.spec.ts) он бы всегда «в прошлом» и
    // cooldown никогда не срабатывал бы. issuedAt восстанавливаем из
    // expiresAt, который сами пишем через `now` ниже — второго поля не нужно.
    const last = await this.model
      .findOne({ email }, { expiresAt: 1 })
      .sort({ expiresAt: -1 })
      .lean<{ expiresAt: Date } | null>();
    if (last && isWithinCooldown(last.expiresAt, now)) return null;

    await this.model.deleteMany({ email });

    const token = randomBytes(32).toString('hex');
    await this.model.create({
      email,
      tokenHash: hashToken(token),
      expiresAt: now.plus({ minutes: EMAIL_LOGIN_TOKEN_TTL_MIN }).toJSDate(),
    });
    return token;
  }

  /** Email владельца токена — `null`, если токен неизвестен, протух или уже
   * использован; вызывающий код не различает эти случаи (один текст ошибки
   * на все три, SECURITY §2). Одноразовость — через саму операцию
   * findOneAndDelete: второй вызов с тем же токеном документа не находит,
   * отдельного флага «использован» не нужно. */
  async consume(token: string, now: DateTime): Promise<string | null> {
    const doc = await this.model
      .findOneAndDelete({
        tokenHash: hashToken(token),
        expiresAt: { $gt: now.toJSDate() },
      })
      .lean<{ email: string } | null>();
    return doc?.email ?? null;
  }
}

function isWithinCooldown(lastExpiresAt: Date, now: DateTime): boolean {
  const issuedAt = DateTime.fromJSDate(lastExpiresAt).minus({
    minutes: EMAIL_LOGIN_TOKEN_TTL_MIN,
  });
  return now.diff(issuedAt, 'minutes').minutes < EMAIL_LOGIN_RESEND_COOLDOWN_MIN;
}
