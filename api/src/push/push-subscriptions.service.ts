// Хранение подписок браузера на push (ADR-0092): запись, отписка и список
// endpoint для отправки (PushSenderService, push-sender.service.ts). Сама
// подпись VAPID и HTTP-запрос на push-сервис здесь не живут — это дело
// PushSenderService/vapid-jwt.ts, этот сервис только владеет коллекцией.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';
import {
  PUSH_NOT_AVAILABLE_MESSAGE,
  type PushSubscriptionDto,
  type SubscribePushInput,
} from '@xuanxue/shared';
import { NotAvailableError } from '../common/errors';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { encryptRecord } from '../utils/encryption';
import {
  toPushSubscriptionDto,
  type RawLeanPushSubscription,
} from './push-subscription.mapper';
import {
  PUSH_SUBSCRIPTION_ENCRYPT_SCHEMA,
  PushSubscriptionRecord,
} from './push-subscription.schema';
import { readVapidConfig } from './vapid.config';

@Injectable()
export class PushSubscriptionsService {
  constructor(
    @InjectModel(PushSubscriptionRecord.name)
    private readonly model: Model<PushSubscriptionRecord>,
    private readonly config: ConfigService,
  ) {}

  /** Показывает и `GET /push/public-key`, и решение подписки ниже — один
   * источник (readVapidConfig), не два расходящихся списка переменных. */
  get isEnabled(): boolean {
    return readVapidConfig(this.config) !== null;
  }

  /**
   * Upsert по `endpoint` (ADR-0092): второй POST того же браузера обновляет
   * запись, а не плодит вторую (CLAUDE.md «Действие с побочным эффектом…
   * идемпотентно»), тем же приёмом, что InAppExamNotifier
   * (findOneAndUpdate(upsert), in-app-exam-notifier.ts/in-app-staff-write.ts).
   * `userId` в `$set` — всегда из сессии (аргумент, не из тела): общий
   * ноутбук, второй человек подписался тем же браузером — upsert обязан
   * переписать владельца, иначе push уедет не тому.
   */
  async subscribe(
    userId: string,
    input: SubscribePushInput,
  ): Promise<PushSubscriptionDto> {
    if (!this.isEnabled) throw new NotAvailableError(PUSH_NOT_AVAILABLE_MESSAGE);

    const filter = { endpoint: input.endpoint };
    const payload = encryptRecord(
      { userId, p256dh: input.p256dh, auth: input.auth },
      PUSH_SUBSCRIPTION_ENCRYPT_SCHEMA,
    );

    let doc: RawLeanPushSubscription | null;
    try {
      doc = await this.model
        .findOneAndUpdate(
          filter,
          { $set: payload },
          { upsert: true, returnDocument: 'after' },
        )
        .lean<RawLeanPushSubscription>();
    } catch (err) {
      // Гонка двух одновременных подписок тем же endpoint (двойной клик,
      // ретрай сети) — тот же приём, что upsertPaymentByFilter (payments.write.ts):
      // конкурент успел вставить документ первым, повтор без upsert его находит.
      if (!isDuplicateKeyError(err)) throw err;
      doc = await this.model
        .findOneAndUpdate(filter, { $set: payload }, { returnDocument: 'after' })
        .lean<RawLeanPushSubscription | null>();
    }
    if (!doc) {
      throw new Error(
        'PushSubscriptionsService.subscribe: документ не найден после записи',
      );
    }
    return toPushSubscriptionDto(doc);
  }

  /**
   * Идемпотентная отписка (ADR-0092): чужой или уже отсутствующий endpoint —
   * тоже успех, ничего не удаляет — не подтверждаем даже факт существования
   * чужой подписки (SECURITY §3), и повторный клик не получает ошибку.
   * Фильтр всегда несёт `userId` — своя подписка, не любая с этим endpoint.
   * Той же отпиской PushSenderService чистит мёртвую подписку по 404/410.
   */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.model.deleteOne({ endpoint, userId });
  }

  /**
   * Только endpoint — для PushSenderService (ADR-0092, «Порядок работ»
   * PR №4). p256dh/auth не читаются вовсе: тело push пустое, ключи
   * шифрования содержимого (RFC 8291) для отправки не нужны — расшифровывать
   * нечего (комментарий у полей в push-subscription.schema.ts). По всем
   * подпискам человека разом — телефон и ноутбук получают пуш одним вызовом.
   */
  async listEndpointsFor(userId: string): Promise<string[]> {
    const docs = await this.model
      .find({ userId }, { endpoint: 1 })
      .lean<{ endpoint: string }[]>();
    return docs.map((doc) => doc.endpoint);
  }
}
