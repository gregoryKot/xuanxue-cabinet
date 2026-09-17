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
import { SCHOOL_TZ } from '@xuanxue/shared';
import { UserRecord } from './user.schema';
import { toLean, type UserDoc, type UserLean } from './users.service';
import { upsertUserByKey } from './upsert-user-by-key';

@Injectable()
export class EmailLoginUserService {
  constructor(@InjectModel(UserRecord.name) private readonly model: Model<UserRecord>) {}

  async findByEmail(email: string): Promise<UserLean | null> {
    const doc = await this.model.findOne({ email }).lean<UserDoc | null>();
    return doc ? toLean(doc) : null;
  }

  /** Атомарный upsert по уникальному индексу email (upsert-user-by-key.ts) —
   * тот же приём, что у Telegram-входа, против гонки двух первых переходов
   * по одной и той же ссылке (двойной клик, два открытых таба). Имя — сам
   * email: у входа по ссылке больше взять неоткуда, «Люди» переименует,
   * когда экран это позволит (следующий PR). */
  async createFromEmail(email: string): Promise<UserLean> {
    const doc =
      (await upsertUserByKey<UserDoc>(
        this.model,
        { email },
        { email, name: email, roles: [], tz: SCHOOL_TZ, status: 'active' },
      )) ?? (await this.model.findOne({ email }).lean<UserDoc | null>());
    if (!doc) {
      // upsert либо вернул документ, либо упал на дубликате — и тогда
      // конкурент его уже записал; пустой ответ здесь означает сбой базы.
      throw new Error('createFromEmail: пользователь не найден после upsert');
    }
    return toLean(doc);
  }
}
