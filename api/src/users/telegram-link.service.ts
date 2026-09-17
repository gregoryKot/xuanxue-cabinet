// Решение «что делать с кодом связки» (ADR-0034) — без Mongoose напрямую:
// собирает TelegramLinkCodeService (одноразовость кода) и UsersService
// (чтение/запись аккаунта), сам с базой не разговаривает (тот же приём, что
// LoginIdentityService). Возвращает размеченный результат, а не бросает
// доменную ошибку на каждый исход — вызывающий (бот, api/src/telegram/**)
// сам решает, каким текстом ответить на каждый kind.
import { Injectable } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { TelegramLinkCodeService } from './telegram-link-code.service';
import { UsersService, type UserLean } from './users.service';

export type TelegramLinkResult =
  | { kind: 'invalid' }
  | { kind: 'taken' }
  | { kind: 'other-telegram' }
  | { kind: 'linked'; user: UserLean };

@Injectable()
export class TelegramLinkService {
  constructor(
    private readonly linkCodeService: TelegramLinkCodeService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Код потребляется ДО всех проверок ниже (TelegramLinkCodeService.consume,
   * findOneAndDelete) — одноразовость важнее удобства: код мог прийти к
   * человеку со стороны (переслали, подсмотрели), и подсунутый код обязан
   * сгореть с первого использования, даже если дальше связка не удалась.
   *
   * Занятый telegramId — отказ (`taken`), не молчаливое слияние аккаунтов:
   * слияние отдало бы чужой аккаунт вместе с ролями тому, кто подсунул код
   * (ADR-0034, SECURITY §2). Объединяет записи вручную админ на «Людях».
   */
  async linkByCode(
    code: string,
    telegramId: number,
    now: DateTime,
  ): Promise<TelegramLinkResult> {
    const userId = await this.linkCodeService.consume(code, now);
    if (!userId) return { kind: 'invalid' };

    const target = await this.usersService.findById(userId);
    if (!target) return { kind: 'invalid' };

    // Идемпотентно: повтор /start той же связки (например, второй код,
    // выпущенный по ошибке для уже связанного аккаунта тем же Telegram) не
    // должен упасть на гонке ниже — записывать нечего, аккаунт уже такой.
    if (target.telegramId === telegramId) return { kind: 'linked', user: target };
    if (target.telegramId !== undefined) return { kind: 'other-telegram' };

    const existingOwner = await this.usersService.findByTelegramId(telegramId);
    if (existingOwner) return { kind: 'taken' };

    // Гонку с другим linkByCode на тот же telegramId между проверкой выше и
    // записью здесь ловит частичный уникальный индекс: attachTelegramId
    // вернёт null, если конкурент успел первым (attach-telegram-id.ts).
    const linked = await this.usersService.attachTelegramId(userId, telegramId);
    if (!linked) return { kind: 'taken' };

    return { kind: 'linked', user: linked };
  }
}
