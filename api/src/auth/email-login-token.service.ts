// Выпуск и потребление заявки на вход по email — одной записи, которую
// можно потратить двумя способами (SECURITY §2, ADR-0029, ADR-0104): ссылка
// (token) и код из письма (code). В базе — только sha256 обоих
// (email-login-token.schema.ts); сырые значения возвращаются наружу один
// раз, при issue(), и живут дальше только в письме и в адресной строке.
// Время — параметром (CLAUDE.md «Время»), не Date.now()/DateTime.utc()
// внутри сервиса.
import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import { generateEmailLoginCode, hashesMatch, hashSecret } from './email-login-code';
import { EmailLoginTokenRecord } from './email-login-token.schema';

// Не env (в отличие от TTL сессии, ADR-0012) — время жизни заявки входа не
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
// Шесть цифр — это 10^6 вариантов, перебор по ним держит не длина кода, а
// этот счётчик: попытки заявки кончаются раньше, чем перебор успевает
// подобрать код (SECURITY §2).
export const EMAIL_LOGIN_CODE_MAX_ATTEMPTS = 5;

export interface IssuedEmailLogin {
  token: string;
  code: string;
}

interface LeanEmailLoginToken {
  _id: Types.ObjectId;
  email: string;
  codeHash?: string;
  attempts: number;
}

@Injectable()
export class EmailLoginTokenService {
  constructor(
    @InjectModel(EmailLoginTokenRecord.name)
    private readonly model: Model<EmailLoginTokenRecord>,
  ) {}

  /** Токен ссылки и код письма для новой заявки — `null`, если этому email
   * только что (меньше EMAIL_LOGIN_RESEND_COOLDOWN_MIN назад) уже
   * отправляли письмо: вызывающий код (EmailAuthService) тогда не шлёт
   * письмо второй раз, но отвечает клиенту так же, как при успехе —
   * существование аккаунта не раскрываем (SECURITY §2). Прежние заявки
   * этого email удаляются перед вставкой новой: новый запрос инвалидирует
   * прежние ссылку и код, а не плодит их параллельно. */
  async issue(email: string, now: DateTime): Promise<IssuedEmailLogin | null> {
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
    const code = generateEmailLoginCode();
    await this.model.create({
      email,
      tokenHash: hashSecret(token),
      codeHash: hashSecret(code),
      attempts: 0,
      expiresAt: now.plus({ minutes: EMAIL_LOGIN_TOKEN_TTL_MIN }).toJSDate(),
    });
    return { token, code };
  }

  /** Email владельца заявки — `null`, если токен неизвестен, протух или уже
   * использован; вызывающий код не различает эти случаи (один текст ошибки
   * на все три, SECURITY §2). Одноразовость — через саму операцию
   * findOneAndDelete: второй вызов с тем же токеном документа не находит,
   * отдельного флага «использован» не нужно. Гасит всю заявку — код письма
   * той же записи (ADR-0104) этим же удалением перестаёт работать. */
  async consume(token: string, now: DateTime): Promise<string | null> {
    const doc = await this.model
      .findOneAndDelete({
        tokenHash: hashSecret(token),
        expiresAt: { $gt: now.toJSDate() },
      })
      .lean<{ email: string } | null>();
    return doc?.email ?? null;
  }

  /** Снять заявку адреса — EmailAuthService.requestLink зовёт, когда issue()
   * выдал её, а письмо не ушло (аудит 2026-09-21): иначе повтор в окне
   * cooldown получит от issue() null и письмо не уйдёт второй раз тоже. */
  async revoke(email: string): Promise<void> {
    await this.model.deleteMany({ email });
  }

  /** Код из письма — второй способ потратить ту же заявку (ADR-0104): та же
   * запись, что у ссылки, и то же «не различаем причину отказа» наружу
   * (SECURITY §2). Счётчик попыток растёт ДО сравнения хешей вызовом
   * findOneAndUpdate — иначе перебор шести цифр бесплатен; исчерпанные
   * попытки сжигают заявку целиком, а не только код: ссылка того же письма
   * (ADR-0104) им тоже перестаёт работать. */
  async consumeCode(email: string, code: string, now: DateTime): Promise<string | null> {
    const doc = await this.model
      .findOneAndUpdate(
        { email, expiresAt: { $gt: now.toJSDate() } },
        { $inc: { attempts: 1 } },
        { new: true },
      )
      .lean<LeanEmailLoginToken | null>();
    if (!doc) return null;

    if (doc.attempts > EMAIL_LOGIN_CODE_MAX_ATTEMPTS) {
      await this.model.deleteOne({ _id: doc._id });
      return null;
    }

    // codeHash может отсутствовать у записи, созданной прежним инстансом во
    // время деплоя (expand → deploy → contract, CLAUDE.md «Данные»/
    // «Деплой») — не баг, а заявка ещё без второго ключа, код на неё не
    // заведён.
    if (!doc.codeHash || !hashesMatch(doc.codeHash, hashSecret(code))) return null;

    // Гонку двух одновременных верных вводов решает сама findOneAndDelete:
    // второй из них документа уже не находит и получает null, как и при
    // обычном повторном использовании.
    const deleted = await this.model
      .findOneAndDelete({ _id: doc._id })
      .lean<{ email: string } | null>();
    return deleted?.email ?? null;
  }
}

function isWithinCooldown(lastExpiresAt: Date, now: DateTime): boolean {
  const issuedAt = DateTime.fromJSDate(lastExpiresAt).minus({
    minutes: EMAIL_LOGIN_TOKEN_TTL_MIN,
  });
  return now.diff(issuedAt, 'minutes').minutes < EMAIL_LOGIN_RESEND_COOLDOWN_MIN;
}
