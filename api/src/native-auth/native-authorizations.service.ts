// Попытка входа нативного Daychi и код обмена (ADR-0181, профиль Workshop
// 3c98d4a, «Browser authorization and callback», «Code exchange»). Каждое
// решение «можно ли» — фильтр одного `findOneAndUpdate`, а не чтение и запись
// следом: две вкладки, повтор и одновременный обмен упираются в атомарность
// документа, а не во флаг в памяти. Отсюда «не больше одного кода на попытку»
// и «ровно один успешный обмен» без транзакций.
//
// Время — только параметром `now`, целыми секундами, как в native-grants.service.ts:
// границы 899/900 секунд попытки и 59/60 секунд кода профиль задаёт на секундах.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Types, type Model, type QueryFilter } from 'mongoose';
import {
  NATIVE_ATTEMPT_LIFETIME_SEC,
  NATIVE_CLIENT_ID,
  NATIVE_CODE_LIFETIME_SEC,
  NATIVE_GRANT_TYPE,
  type NativeTokenInput,
  type NativeTokenResponse,
} from '@xuanxue/shared';
import { UsersService } from '../users/users.service';
import { NativeAuthError } from './native-auth-error';
import { NativeAuthorizationRecord } from './native-authorization.schema';
import { NativeGrantsService } from './native-grants.service';
import {
  isNativeSecretFormat,
  newNativeSecret,
  s256Challenge,
  sha256Hex,
} from './native-secrets';

const OBJECT_ID_RE = /^[0-9a-f]{24}$/;

/** Проверенные параметры запроса Daychi — то, что запись хранит и отдаёт назад. */
export type NativeAuthorizationParams = Pick<
  NativeAuthorizationRecord,
  'issuer' | 'clientId' | 'redirectUri' | 'scope' | 'state' | 'codeChallenge'
>;

/** Куда и с чем вернуть браузер в Daychi: параметры — из записи, не из адреса. */
export type NativeCallbackTarget = Pick<
  NativeAuthorizationRecord,
  'issuer' | 'redirectUri' | 'state'
>;

/** Завершение: код для активного человека или отказ без кода (отмена, блокировка). */
export type NativeCompletion = { userId: string } | { denied: true };

export interface NativeCompleted extends NativeCallbackTarget {
  /** Сырой код — ровно один раз, в базе только его sha256. Нет при отказе. */
  code?: string;
}

function dateAt(seconds: number): Date {
  return DateTime.fromSeconds(seconds, { zone: 'utc' }).toJSDate();
}

function epochSeconds(now: DateTime): number {
  return Math.floor(now.toSeconds());
}

function callbackTarget(record: NativeCallbackTarget): NativeCallbackTarget {
  return { issuer: record.issuer, redirectUri: record.redirectUri, state: record.state };
}

@Injectable()
export class NativeAuthorizationsService {
  constructor(
    @InjectModel(NativeAuthorizationRecord.name)
    private readonly model: Model<NativeAuthorizationRecord>,
    private readonly usersService: UsersService,
    private readonly grants: NativeGrantsService,
  ) {}

  async create(
    params: NativeAuthorizationParams,
    bindingHash: string,
    now: DateTime,
  ): Promise<string> {
    const createdAt = epochSeconds(now);
    const record = await this.model.create({
      ...params,
      bindingHash,
      expiresAt: dateAt(createdAt + NATIVE_ATTEMPT_LIFETIME_SEC),
      purgeAt: dateAt(createdAt + NATIVE_ATTEMPT_LIFETIME_SEC + NATIVE_CODE_LIFETIME_SEC),
    });
    return record._id.toString();
  }

  /** Попытка этого браузера, ещё не завершённая и не истёкшая; иначе `null`.
   * Нужна продолжению до входа: истёкшую попытку незачем вести на экран входа. */
  async findPending(
    attemptId: string,
    bindingHash: string,
    now: DateTime,
  ): Promise<NativeCallbackTarget | null> {
    if (!OBJECT_ID_RE.test(attemptId)) return null;
    const record = await this.model
      .findOne(this.pendingFilter(attemptId, bindingHash, now))
      .lean<NativeAuthorizationRecord>();
    return record ? callbackTarget(record) : null;
  }

  /** Завершает попытку один раз. Чужая привязка, истёкшая, уже завершённая и
   * несуществующая попытка — `null`: код не выдаётся, параметры не раскрываются. */
  async complete(
    attemptId: string,
    bindingHash: string,
    outcome: NativeCompletion,
    now: DateTime,
  ): Promise<NativeCompleted | null> {
    if (!OBJECT_ID_RE.test(attemptId)) return null;
    const completedAt = epochSeconds(now);
    const $set: Partial<NativeAuthorizationRecord> = { completedAt: dateAt(completedAt) };
    let code: string | undefined;
    if ('userId' in outcome) {
      code = newNativeSecret();
      $set.userId = new Types.ObjectId(outcome.userId);
      $set.codeHash = sha256Hex(code);
      $set.codeExpiresAt = dateAt(completedAt + NATIVE_CODE_LIFETIME_SEC);
    }
    const record = await this.model
      .findOneAndUpdate(this.pendingFilter(attemptId, bindingHash, now), { $set })
      .lean<NativeAuthorizationRecord>();
    if (!record) return null;
    return { ...callbackTarget(record), code };
  }

  /** Обмен кода на bearer. Порядок проверок — профиль: тип гранта, клиент,
   * форма кода и verifier, затем сам код. Неверный verifier, чужой redirect URI
   * и истёкший код не проходят фильтр и чужой код не тратят. Человека
   * проверяем после траты: удалённый или заблокированный код теряет. */
  async exchange(input: NativeTokenInput, now: DateTime): Promise<NativeTokenResponse> {
    if (input.grant_type !== NATIVE_GRANT_TYPE) {
      throw new NativeAuthError('unsupported_grant_type');
    }
    if (input.client_id !== NATIVE_CLIENT_ID) throw new NativeAuthError('invalid_client');
    if (!isNativeSecretFormat(input.code) || !isNativeSecretFormat(input.code_verifier)) {
      throw new NativeAuthError('invalid_request');
    }
    const record = await this.model
      .findOneAndUpdate(
        {
          codeHash: sha256Hex(input.code),
          clientId: input.client_id,
          redirectUri: input.redirect_uri,
          codeChallenge: s256Challenge(input.code_verifier),
          codeConsumedAt: null,
          codeExpiresAt: { $gt: dateAt(epochSeconds(now)) },
        },
        { $set: { codeConsumedAt: dateAt(epochSeconds(now)) } },
      )
      .lean<NativeAuthorizationRecord>();
    const userId = record?.userId?.toString();
    if (!userId) throw new NativeAuthError('invalid_grant');
    const user = await this.usersService.findById(userId);
    if (user?.status !== 'active') throw new NativeAuthError('invalid_grant');
    return this.grants.issueGrant(user.id, now);
  }

  private pendingFilter(
    attemptId: string,
    bindingHash: string,
    now: DateTime,
  ): QueryFilter<NativeAuthorizationRecord> {
    return {
      _id: new Types.ObjectId(attemptId),
      bindingHash,
      completedAt: null,
      expiresAt: { $gt: dateAt(epochSeconds(now)) },
    };
  }
}
