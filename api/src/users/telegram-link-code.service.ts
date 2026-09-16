// Выпуск и потребление одноразового кода связки Telegram (ADR-0034,
// shared/src/telegram-link.ts). В базе — только sha256(code)
// (telegram-link-code.schema.ts); сырой код возвращается наружу один раз,
// внутри готовой ссылки на бота, — тот же приём, что у
// EmailLoginTokenService/InviteLinkService. Время — параметром (CLAUDE.md
// «Время»), не Date.now()/DateTime.utc() внутри сервиса.
import { createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import {
  TELEGRAM_LINK_NOT_AVAILABLE_MESSAGE,
  TELEGRAM_LINK_START_PREFIX,
  type TelegramLinkCodeDto,
} from '@xuanxue/shared';
import { NotAvailableError } from '../common/errors';
import { BotIdentityService } from '../telegram/bot-identity.service';
import { TelegramLinkCodeRecord } from './telegram-link-code.schema';

// Не cooldown, как у письма (EMAIL_LOGIN_RESEND_COOLDOWN_MIN): письмо шлётся
// стороннему сервису и стоит денег/репутации при спаме, а код связки —
// собственный ответ на запрос уже вошедшей сессии; повторный клик «Связать
// Telegram» — не атака, а нормальный повтор (передумал, вкладка потерялась).
export const TELEGRAM_LINK_CODE_TTL_MIN = 15;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

@Injectable()
export class TelegramLinkCodeService {
  constructor(
    private readonly botIdentity: BotIdentityService,
    @InjectModel(TelegramLinkCodeRecord.name)
    private readonly model: Model<TelegramLinkCodeRecord>,
  ) {}

  /** Готовая ссылка в чат с ботом вместе с кодом внутри. Прежние коды этого
   * человека удаляются перед вставкой нового — активная ссылка всегда одна
   * (тот же приём, что у InviteLinkService.rotate). Бот ещё не прогрелся
   * (имя ещё не известно) — NotAvailableError, ссылку не собрать. */
  async issueLink(userId: string, now: DateTime): Promise<TelegramLinkCodeDto> {
    const botUsername = this.botIdentity.get();
    if (!botUsername) throw new NotAvailableError(TELEGRAM_LINK_NOT_AVAILABLE_MESSAGE);

    await this.model.deleteMany({ userId });

    const code = randomBytes(16).toString('hex');
    await this.model.create({
      userId,
      codeHash: hashCode(code),
      expiresAt: now.plus({ minutes: TELEGRAM_LINK_CODE_TTL_MIN }).toJSDate(),
    });

    return {
      telegramUrl: `https://t.me/${botUsername}?start=${TELEGRAM_LINK_START_PREFIX}${code}`,
    };
  }

  /** userId владельца кода — `null`, если код неизвестен, просрочен или уже
   * использован (один и тот же ответ на все три причины, как у
   * EmailLoginTokenService.consume). Одноразовость — через саму операцию
   * findOneAndDelete: второй вызов с тем же кодом документа не находит. */
  async consume(code: string, now: DateTime): Promise<string | null> {
    const doc = await this.model
      .findOneAndDelete({
        codeHash: hashCode(code),
        expiresAt: { $gt: now.toJSDate() },
      })
      .lean<{ userId: Types.ObjectId } | null>();
    return doc ? doc.userId.toString() : null;
  }
}
