// Поиск/создание пользователя по email для входа по одноразовой ссылке
// (ADR-0005, ADR-0029) — отдельный файл, не методы в UsersService: тот уже
// на пределе файла-храповика (CLAUDE.md «Храповики», тот же приём, что у
// UserNamesService/TeachersService). Новый человек по email заводится
// только из LoginIdentityService, после проверки ссылки-приглашения
// (ADR-0030/0036) — сюда доходят уже зная, что код валиден, поэтому статус
// сразу `active`/`roles: []`. BOOTSTRAP_ADMIN_TELEGRAM_ID на этот путь не
// действует — это Telegram-специфичный бутстрап (ADR-0005).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NEW_PERSON_NAME } from '@xuanxue/shared';
import { UserRecord } from './user.schema';
import { toLean, type UserDoc, type UserLean } from './users.service';
import { upsertUserByKey } from './upsert-user-by-key';

@Injectable()
export class EmailLoginUserService {
  constructor(@InjectModel(UserRecord.name) private readonly model: Model<UserRecord>) {}

  /** Ищет только по подтверждённому `email`, `pendingEmail` для входа не
   * существует (ADR-0059): опечатка в адресе, набранном в форме привязки,
   * иначе отдала бы ключ от кабинета тому, кто владеет этим (чужим) ящиком. */
  async findByEmail(email: string): Promise<UserLean | null> {
    const doc = await this.model.findOne({ email }).lean<UserDoc | null>();
    return doc ? toLean(doc) : null;
  }

  /** Атомарный upsert по уникальному индексу email (upsert-user-by-key.ts) —
   * тот же приём, что у Telegram-входа, против гонки двух первых переходов
   * по одной и той же ссылке (двойной клик, два открытых таба). Имя —
   * заглушка NEW_PERSON_NAME, не сам email: адрес почты — ключ входа
   * (SECURITY §1), и до этого PR он утекал и в список «Ученики», и в
   * приветствие. Настоящее имя человек вводит сам экраном `/welcome`
   * (ADR-0044, PATCH /me/profile, UserProfileService.setName). */
  async createFromEmail(email: string): Promise<UserLean> {
    const doc =
      (await upsertUserByKey<UserDoc>(
        this.model,
        { email },
        { email, name: NEW_PERSON_NAME, roles: [], status: 'active' },
      )) ?? (await this.model.findOne({ email }).lean<UserDoc | null>());
    if (!doc) {
      // upsert либо вернул документ, либо упал на дубликате — и тогда
      // конкурент его уже записал; пустой ответ здесь означает сбой базы.
      throw new Error('createFromEmail: пользователь не найден после upsert');
    }
    return toLean(doc);
  }
}
