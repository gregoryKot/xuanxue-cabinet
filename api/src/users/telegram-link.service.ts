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
  | { kind: 'blocked' }
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
   *
   * Заблокированный аккаунт — отказ (`blocked`) без записи telegramId, тем
   * же общим ACCESS_MESSAGE, что и у остальных входов бота (SECURITY §2):
   * иначе связка стала бы ключом входа, который включится сам при возврате
   * доступа. Код при этом уже сгорел — см. выше.
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

    // Закрытый доступ отказывает и здесь, тем же общим текстом, что в вебе и в
    // остальных входах бота (SECURITY §2, ACCESS_MESSAGE). Проверка стоит до
    // записи: telegramId на заблокированном аккаунте — это ключ входа, который
    // включится сам, когда админ вернёт доступ одной кнопкой («Открыть
    // доступ» обратим, SECURITY §2), а код связки мог уйти постороннему
    // ссылкой — ровно тот сценарий, ради которого ADR-0034 отказался от
    // слияния аккаунтов. Найдено на PR #190, где закрыли только канал.
    if (target.status === 'blocked') return { kind: 'blocked' };

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

    // Между чтением выше и этой записью админ мог закрыть доступ — документ
    // возвращается уже заблокированным (`returnDocument: 'after'`,
    // attach-telegram-id.ts). Отказываем тем же исходом: иначе на человека,
    // которому доступ уже закрыли, заведётся канал доставки. Снять оставшийся
    // telegramId — RUNBOOK §8.17.
    if (linked.status === 'blocked') return { kind: 'blocked' };

    return { kind: 'linked', user: linked };
  }
}
