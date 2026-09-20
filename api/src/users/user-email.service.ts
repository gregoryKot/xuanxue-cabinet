// Чтение/запись email-полей аккаунта для привязки почты к уже вошедшему
// человеку (ADR-0059) — отдельный файл, не методы в UsersService: тот стоит
// на 160 строках и расти не может (CLAUDE.md «Храповики», тот же приём, что
// у UserProfileService/EmailLoginUserService). Модель инжектится напрямую,
// как там же.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { USER_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { assertObjectId } from '../common/object-id';
import { UserRecord } from './user.schema';

@Injectable()
export class UserEmailService {
  constructor(@InjectModel(UserRecord.name) private readonly model: Model<UserRecord>) {}

  /** Есть ли ДРУГОЙ аккаунт с этим адресом как подтверждённым `email`.
   * Вызывается только когда у текущего аккаунта своего `email` ещё нет
   * (EmailLinkService.link проверяет это раньше) — значит, найденный
   * документ обязательно чужой. Смотрит только на `email`, не на
   * `pendingEmail`: заявка постороннего на тот же адрес не блокирует его —
   * решает подтверждение, а не заявка (user.schema.ts). */
  async isEmailTaken(email: string): Promise<boolean> {
    return (await this.model.exists({ email })) !== null;
  }

  /** `userId` — из сессии (`@CurrentUser()`), тот же приём защиты, что у
   * UserProfileService.setName: невалидный ObjectId — не повод падать 500. */
  async setPendingEmail(userId: string, email: string): Promise<void> {
    assertObjectId(userId, USER_NOT_FOUND_MESSAGE);
    await this.model.updateOne({ _id: userId }, { $set: { pendingEmail: email } });
  }

  /**
   * Атомарный условный апдейт — тот же приём, что у attachTelegramId
   * (attach-telegram-id.ts): гонка двух одновременных подтверждений ОДНОГО
   * адреса (два открытых таба со ссылкой из письма, или другой человек,
   * успевший подтвердить тот же адрес первым) упирается в частичный
   * уникальный индекс `email` (user.schema.ts) — E11000 ловим и превращаем в
   * `'taken'`, а не роняем 500.
   *
   * Условие не совпало без исключения — findOneAndUpdate вернул `null`:
   * перечитываем документ. `doc.email === email` значит кто-то (в том числе
   * этот же запрос при повторе — идемпотентно, ссылку могли открыть дважды)
   * уже перевёл `pendingEmail` в `email` — отвечаем `'ok'`. Иначе токен
   * пережил смену `pendingEmail`/`email` на аккаунте между issue() и этим
   * вызовом — `'stale'`.
   */
  async confirmEmail(userId: string, email: string): Promise<'ok' | 'taken' | 'stale'> {
    try {
      const updated = await this.model
        .findOneAndUpdate(
          { _id: userId, pendingEmail: email, email: { $exists: false } },
          { $set: { email }, $unset: { pendingEmail: 1 } },
        )
        .lean();
      if (updated) return 'ok';
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      return 'taken';
    }

    const doc = await this.model.findById(userId).lean<{ email?: string } | null>();
    return doc?.email === email ? 'ok' : 'stale';
  }
}
