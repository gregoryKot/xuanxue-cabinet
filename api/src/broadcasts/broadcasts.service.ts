// Разовая рассылка (docs/PLAN.md §6 «Рассылки») — данные школы (ADR-0010).
// Контроллер валидирует тело (CreateBroadcastDto), сервис проверяет каналы и
// создаёт broadcast+deliveries через общий insertBroadcastWithDeliveries
// (broadcast.inserts.ts, как и планировщик ссылок/записи) — раннер
// (DeliveryRunnerService) возьмёт их по nextAttemptAt.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import type { BroadcastDto, CreateBroadcastInput } from '@xuanxue/shared';
import { InvalidInputError, NotFoundError } from '../common/errors';
import { encryptSchemaFrom } from '../common/field-policy';
import { assertObjectId } from '../common/object-id';
import { decryptRecord } from '../utils/encryption';
import { parseUtcIso } from '../lessons/lesson-dates';
import { ChannelRecord } from '../channels/channel.schema';
import { DeliveryRecord } from '../deliveries/delivery.schema';
import { insertBroadcastWithDeliveries } from './broadcast.inserts';
import { BROADCAST_FIELD_POLICY, BroadcastRecord } from './broadcast.schema';
import { toBroadcastDto, type LeanBroadcast } from './broadcast.mapper';

const ENCRYPT_SCHEMA = encryptSchemaFrom(BROADCAST_FIELD_POLICY);
const BROADCAST_NOT_FOUND = 'Рассылка не найдена. Обновите страницу.';
// VOICE.md: два предложения — что случилось и что сделать.
const CHANNEL_DELETED_MESSAGE = 'Канал удалён — уберите его из списка.';

interface ChannelStatus {
  _id: Types.ObjectId;
  title: string;
  active: boolean;
}

@Injectable()
export class BroadcastsService {
  constructor(
    @InjectModel(BroadcastRecord.name) private readonly model: Model<BroadcastRecord>,
    @InjectModel(DeliveryRecord.name)
    private readonly deliveryModel: Model<DeliveryRecord>,
    @InjectModel(ChannelRecord.name)
    private readonly channelModel: Model<ChannelRecord>,
  ) {}

  async createManual(
    input: CreateBroadcastInput,
    createdBy: string,
    now: DateTime,
  ): Promise<BroadcastDto> {
    await this.assertChannelsActive(input.channelIds);
    // scheduledAt в прошлом — раннер берёт на первом же тике (findClaimable,
    // delivery-runner.queries.ts), отдельного пути «отправить сразу» не нужно.
    const scheduledAt = input.scheduledAt
      ? parseUtcIso(input.scheduledAt, 'scheduledAt')
      : now;

    // manual — без естественного ключа (naturalKeyFilter, broadcast.inserts.ts):
    // повторный POST создаёт вторую рассылку, а не находит первую
    // (docs/PLAN.md §6) — защита от двойного клика придёт вместе с экраном.
    const { broadcastId } = await insertBroadcastWithDeliveries(
      this.model,
      this.deliveryModel,
      {
        kind: 'manual',
        channelIds: input.channelIds.map((id) => new Types.ObjectId(id)),
        scheduledAt: scheduledAt.toJSDate(),
        deliveryNextAttemptAt: scheduledAt.toJSDate(),
        text: input.text,
        createdBy: new Types.ObjectId(createdBy),
      },
    );
    return this.getById(broadcastId.toString());
  }

  async getById(id: string): Promise<BroadcastDto> {
    assertObjectId(id, BROADCAST_NOT_FOUND);
    const doc = await this.model.findById(id).lean<LeanBroadcast>();
    if (!doc) throw new NotFoundError(BROADCAST_NOT_FOUND);
    return toBroadcastDto(decryptRecord(doc, ENCRYPT_SCHEMA));
  }

  /** Каналы существуют и активны — иначе рассылка ушла бы в никуда молча
   * (docs/PLAN.md §6). Останавливаемся на первой проблеме: конкретный канал
   * по имени понятнее списка id (VOICE.md — конкретика вместо обобщений). */
  private async assertChannelsActive(channelIds: string[]): Promise<void> {
    const docs = await this.channelModel
      .find({ _id: { $in: channelIds } }, { title: 1, active: 1 })
      .lean<ChannelStatus[]>();
    const byId = new Map(docs.map((doc) => [doc._id.toString(), doc]));
    for (const id of channelIds) {
      const doc = byId.get(id);
      if (!doc) throw new InvalidInputError(CHANNEL_DELETED_MESSAGE);
      if (!doc.active) {
        throw new InvalidInputError(
          `Канал «${doc.title}» выключен. Включите его или уберите из списка.`,
        );
      }
    }
  }
}
