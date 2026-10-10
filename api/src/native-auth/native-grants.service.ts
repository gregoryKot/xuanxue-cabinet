// Нативные bearer-доступы Daychi: выдача, проверка, продление, отзыв (ADR-0181,
// профиль Workshop 3c98d4a). Один сервис — вся механика, чтобы правила сроков и
// порядок проверок жили рядом и проверялись одним тестом на настоящей Mongo.
//
// Время — только параметром `now` и только целыми секундами: профиль задаёт
// `renew_after = max(0, issuedAt + 604801 - now)` и границы 604800/604801 и
// «expiry−1 / expiry» именно на секундах (N08). Даты в базе тоже целые секунды.
//
// Согласованность без транзакций: доступ проверяется при КАЖДОМ использовании
// bearer, поэтому credential, выпущенный параллельно с отзывом, после
// подтверждённого отзыва не пройдёт (N12). Порядок записи при продлении —
// сначала `purgeAt` доступа, потом credential: запись об отзыве не должна
// исчезнуть раньше последнего ключа.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import {
  NATIVE_CLIENT_ID,
  NATIVE_CREDENTIAL_LIFETIME_SEC,
  NATIVE_RENEW_THRESHOLD_SEC,
  NATIVE_SCOPE,
  NATIVE_TOKEN_TYPE,
  type NativeAccountResponse,
  type NativeTokenResponse,
} from '@xuanxue/shared';
import { UsersService, type UserLean } from '../users/users.service';
import { NativeAuthError } from './native-auth-error';
import { NativeCredentialRecord } from './native-credential.schema';
import { NativeGrantRecord } from './native-grant.schema';
import { isNativeSecretFormat, newNativeSecret, sha256Hex } from './native-secrets';

type WithId<T> = T & { _id: Types.ObjectId };
export type NativeCredentialLean = WithId<NativeCredentialRecord>;
type NativeGrantLean = WithId<NativeGrantRecord>;

type NativeCredentialTimes = Pick<
  NativeCredentialRecord,
  'grantId' | 'issuedAt' | 'expiresAt'
>;

export interface NativeAuthentication {
  user: UserLean;
  credential: NativeCredentialLean;
  grant: NativeGrantLean;
}

/** `renew_after` отсчитывается от порога + 1: на возрасте ровно 604800 секунд
 * продлевать ещё нельзя (профиль: «strictly greater»). */
const RENEW_AFTER_SEC = NATIVE_RENEW_THRESHOLD_SEC + 1;

function epochSeconds(now: DateTime): number {
  return Math.floor(now.toSeconds());
}

function dateAt(seconds: number): Date {
  return DateTime.fromSeconds(seconds, { zone: 'utc' }).toJSDate();
}

function secondsOf(date: Date): number {
  return Math.floor(DateTime.fromJSDate(date).toSeconds());
}

@Injectable()
export class NativeGrantsService {
  constructor(
    @InjectModel(NativeGrantRecord.name)
    private readonly grantModel: Model<NativeGrantRecord>,
    @InjectModel(NativeCredentialRecord.name)
    private readonly credentialModel: Model<NativeCredentialRecord>,
    private readonly usersService: UsersService,
  ) {}

  /** Новый доступ и его первый bearer. Сырой токен возвращается ровно один раз. */
  async issueGrant(userId: string, now: DateTime): Promise<NativeTokenResponse> {
    const issuedAt = epochSeconds(now);
    const grant = await this.grantModel.create({
      userId,
      clientId: NATIVE_CLIENT_ID,
      purgeAt: dateAt(issuedAt + NATIVE_CREDENTIAL_LIFETIME_SEC),
    });
    const credential = await this.insertCredential(grant._id, grant.userId, issuedAt);
    return this.tokenResponse(credential.token, credential.record, now);
  }

  /** Порядок проверок — часть контракта: сначала bearer (формат, запись, срок,
   * доступ, человек), и только потом статус человека. Негодный bearer не должен
   * показывать, заблокирован ли аккаунт (профиль, «Failures and recovery»). */
  async authenticate(token: string, now: DateTime): Promise<NativeAuthentication> {
    if (!isNativeSecretFormat(token)) throw new NativeAuthError('invalid_token');
    const credential = await this.findCredential(token);
    if (!credential || epochSeconds(now) >= secondsOf(credential.expiresAt)) {
      throw new NativeAuthError('invalid_token');
    }
    const grant = await this.grantModel
      .findById(credential.grantId)
      .lean<NativeGrantLean>();
    if (!grant || grant.revokedAt) throw new NativeAuthError('invalid_token');
    const user = await this.usersService.findById(credential.userId.toString());
    if (!user) throw new NativeAuthError('invalid_token');
    if (user.status === 'blocked') throw new NativeAuthError('account_blocked');
    return { user, credential, grant };
  }

  /** Продление — только за порогом. Раньше возвращается присланный bearer с
   * остатком срока; после порога выпускается новый, прежний живёт до своего
   * срока (N09: потерянный ответ продления не выкидывает клиента). Два
   * одновременных продления выпустят два bearer одного доступа, и это допустимо. */
  async renew(token: string, now: DateTime): Promise<NativeTokenResponse> {
    const { credential } = await this.authenticate(token, now);
    const age = epochSeconds(now) - secondsOf(credential.issuedAt);
    if (age <= NATIVE_RENEW_THRESHOLD_SEC)
      return this.tokenResponse(token, credential, now);

    const issuedAt = epochSeconds(now);
    await this.grantModel.updateOne(
      { _id: credential.grantId },
      { $max: { purgeAt: dateAt(issuedAt + NATIVE_CREDENTIAL_LIFETIME_SEC) } },
    );
    const fresh = await this.insertCredential(
      credential.grantId,
      credential.userId,
      issuedAt,
    );
    return this.tokenResponse(fresh.token, fresh.record, now);
  }

  /** Отзыв никогда не отказывает: чужой, неизвестный, уже отозванный и истёкший
   * токен получают тот же ответ, что настоящий (RFC 7009, профиль). Истёкший
   * bearer, запись о котором ещё не убрал TTL, отзывает свой доступ целиком. */
  async revoke(token: string, now: DateTime): Promise<void> {
    if (!isNativeSecretFormat(token)) return;
    const credential = await this.findCredential(token);
    if (!credential) return;
    await this.grantModel.updateOne(
      { _id: credential.grantId, revokedAt: null },
      { $set: { revokedAt: dateAt(epochSeconds(now)) } },
    );
  }

  /** Сроки описывают присланный bearer, а не самый свежий выпущенный доступу
   * (профиль, «Transport»). */
  sessionView(
    credential: NativeCredentialTimes,
    now: DateTime,
  ): NativeAccountResponse['session'] {
    return {
      id: credential.grantId.toString(),
      expires_in: Math.max(0, secondsOf(credential.expiresAt) - epochSeconds(now)),
      renew_after: Math.max(
        0,
        secondsOf(credential.issuedAt) + RENEW_AFTER_SEC - epochSeconds(now),
      ),
    };
  }

  private tokenResponse(
    token: string,
    credential: NativeCredentialTimes,
    now: DateTime,
  ): NativeTokenResponse {
    const { id, expires_in, renew_after } = this.sessionView(credential, now);
    return {
      access_token: token,
      token_type: NATIVE_TOKEN_TYPE,
      expires_in,
      scope: NATIVE_SCOPE,
      session_id: id,
      renew_after,
    };
  }

  private findCredential(token: string): Promise<NativeCredentialLean | null> {
    return this.credentialModel
      .findOne({ tokenHash: sha256Hex(token) })
      .lean<NativeCredentialLean>();
  }

  private async insertCredential(
    grantId: Types.ObjectId,
    userId: Types.ObjectId,
    issuedAt: number,
  ): Promise<{ token: string; record: NativeCredentialRecord }> {
    const token = newNativeSecret();
    const record = await this.credentialModel.create({
      tokenHash: sha256Hex(token),
      grantId,
      userId,
      issuedAt: dateAt(issuedAt),
      expiresAt: dateAt(issuedAt + NATIVE_CREDENTIAL_LIFETIME_SEC),
    });
    return { token, record };
  }
}
