// Чтение/запись UserRecord по ключу входа Google (ADR-0145) — отдельный
// файл, не методы в UsersService: та же причина, что у EmailLoginUserService
// (файл-храповик, CLAUDE.md «Храповики»). `sub` — единственный ключ поиска:
// он не меняется, в отличие от email, который Google может однажды
// перевыпустить на другой ящик (см. google-login-identity.service.ts).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { attachGoogleId } from './attach-google-id';
import { UserRecord } from './user.schema';
import { toLean, type UserDoc, type UserLean } from './users.service';
import { upsertUserByKey } from './upsert-user-by-key';

export interface NewGoogleUser {
  sub: string;
  name: string;
  /** Только если Google ручается за адрес (emailAuthoritative,
   * google-id-token.ts) — иначе e-mail входа не заводим вовсе. */
  email?: string;
}

@Injectable()
export class GoogleLoginUserService {
  constructor(@InjectModel(UserRecord.name) private readonly model: Model<UserRecord>) {}

  async findByGoogleId(sub: string): Promise<UserLean | null> {
    const doc = await this.model.findOne({ googleId: sub }).lean<UserDoc | null>();
    return doc ? toLean(doc) : null;
  }

  /** Атомарный upsert по уникальному индексу googleId (upsert-user-by-key.ts)
   * — та же защита от гонки двух первых входов, что у Telegram/email. Новый
   * человек через Google заводится только после проверки ссылки-приглашения
   * (GoogleLoginIdentityService) — сюда доходят уже зная, что код валиден. */
  async createFromGoogle(input: NewGoogleUser): Promise<UserLean> {
    const doc =
      (await upsertUserByKey<UserDoc>(
        this.model,
        { googleId: input.sub },
        {
          googleId: input.sub,
          name: input.name,
          email: input.email,
          roles: [],
          status: 'active',
        },
      )) ?? (await this.model.findOne({ googleId: input.sub }).lean<UserDoc | null>());
    if (!doc) {
      // upsert либо вернул документ, либо упал на дубликате — и тогда
      // конкурент его уже записал; пустой ответ здесь означает сбой базы.
      throw new Error('createFromGoogle: пользователь не найден после upsert');
    }
    return toLean(doc);
  }

  /** Ставит googleId на аккаунт, найденный по подтверждённому email, у
   * которого его ещё нет — `null`, если гонку выиграл кто-то другой (та же
   * защита, что у UsersService.attachTelegramId). Логика — в
   * attach-google-id.ts (та же причина выноса, что у markJoinedViaInvite). */
  async attachGoogleId(userId: string, sub: string): Promise<UserLean | null> {
    return attachGoogleId(this.model, userId, sub);
  }
}
