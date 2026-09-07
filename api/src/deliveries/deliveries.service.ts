// GET /deliveries/:id, POST /deliveries/:id/mark-sent — ручная доставка
// (docs/PLAN.md §6 «Доставка»): учитель сам копирует текст в Facebook/Boosty
// и нажимает «отметить отправленным», когда закончил. Данные школы, ADR-0010.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import type { ChannelType, DeliveryDto, DeliveryStatus } from '@xuanxue/shared';
import { ConflictError, NotFoundError } from '../common/errors';
import { encryptSchemaFrom } from '../common/field-policy';
import { assertObjectId } from '../common/object-id';
import { decryptRecord } from '../utils/encryption';
import { BROADCAST_FIELD_POLICY, BroadcastRecord } from '../broadcasts/broadcast.schema';
import { ChannelRecord } from '../channels/channel.schema';
import { refreshBroadcastStatus } from './delivery-runner.status';
import { DELIVERY_FIELD_POLICY, DeliveryRecord } from './delivery.schema';
import { toDeliveryDto, type LeanDelivery } from './delivery.mapper';

const ENCRYPT_SCHEMA = encryptSchemaFrom(DELIVERY_FIELD_POLICY);
const BROADCAST_ENCRYPT_SCHEMA = encryptSchemaFrom(BROADCAST_FIELD_POLICY);
const DELIVERY_NOT_FOUND = 'Доставка не найдена. Обновите страницу.';
// VOICE.md: что случилось и что делать — здесь делать нечего, кнопка нажата
// не туда, поэтому текст объясняет, почему нажимать не нужно.
const NOT_MANUAL_MESSAGE = 'Эта доставка уходит сама. Отмечать не нужно.';
const ALREADY_SENT_MESSAGE = 'Уже отправлено.';
/** pending/manual — статусы доставки в ручной канал, которые кнопка может
 * закрыть: pending — учитель успел раньше тика раннера (текст уже виден в
 * GET /deliveries/:id, ждать нечего), manual — обычный путь после тика. */
const MARKABLE_STATUSES: DeliveryStatus[] = ['pending', 'manual'];

interface DeliveryChannelOnly {
  broadcastId: Types.ObjectId;
  channelId: Types.ObjectId;
}

@Injectable()
export class DeliveriesService {
  constructor(
    @InjectModel(DeliveryRecord.name) private readonly model: Model<DeliveryRecord>,
    @InjectModel(BroadcastRecord.name)
    private readonly broadcastModel: Model<BroadcastRecord>,
    @InjectModel(ChannelRecord.name) private readonly channelModel: Model<ChannelRecord>,
  ) {}

  async getById(id: string): Promise<DeliveryDto> {
    assertObjectId(id, DELIVERY_NOT_FOUND);
    const doc = await this.model.findById(id).lean<LeanDelivery>();
    if (!doc) throw new NotFoundError(DELIVERY_NOT_FOUND);
    const text = await this.manualText(doc);
    return toDeliveryDto(decryptRecord(doc, ENCRYPT_SCHEMA), text);
  }

  /** Решение по ТИПУ канала доставки, не по её текущему статусу: у ручного
   * канала кнопка закрывает и `pending` (учитель успел раньше тика — текст
   * уже виден), и `manual` (обычный путь после тика); у telegram/vk доставка
   * всегда уходит сама, кнопка тут ни при чём. Условный updateOne закрывает
   * гонку двойного клика: второй запрос не находит документ для апдейта
   * (`status` уже не в MARKABLE_STATUSES) и получает «уже отправлено». */
  async markSent(id: string, now: DateTime): Promise<DeliveryDto> {
    assertObjectId(id, DELIVERY_NOT_FOUND);
    const current = await this.model
      .findById(id, { broadcastId: 1, channelId: 1 })
      .lean<DeliveryChannelOnly | null>();
    if (!current) throw new NotFoundError(DELIVERY_NOT_FOUND);

    const channel = await this.channelModel
      .findById(current.channelId, { type: 1 })
      .lean<{ type: ChannelType } | null>();
    if (channel?.type !== 'manual') throw new ConflictError(NOT_MANUAL_MESSAGE);

    const { modifiedCount } = await this.model.updateOne(
      { _id: id, status: { $in: MARKABLE_STATUSES } },
      { $set: { status: 'sent', sentAt: now.toJSDate() } },
    );
    if (modifiedCount === 0) throw new ConflictError(ALREADY_SENT_MESSAGE);

    await refreshBroadcastStatus(
      this.model,
      this.broadcastModel,
      current.broadcastId,
      now,
    );
    return this.getById(id);
  }

  /** Текст рассылки — только когда сама доставка идёт через ручной канал
   * (docs/PLAN.md §6): у telegram/vk копировать нечего, доставка ушла сама. */
  private async manualText(delivery: LeanDelivery): Promise<string | undefined> {
    const channel = await this.channelModel
      .findById(delivery.channelId, { type: 1 })
      .lean<{ type: ChannelType } | null>();
    if (channel?.type !== 'manual') return undefined;

    const broadcast = await this.broadcastModel
      .findById(delivery.broadcastId, { text: 1 })
      .lean<{ text: string } | null>();
    if (!broadcast) return undefined;
    return decryptRecord({ text: broadcast.text }, BROADCAST_ENCRYPT_SCHEMA).text;
  }
}
