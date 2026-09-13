// Расшифрованный `config`, идемпотентный upsert Telegram-чата и список
// активных chatId — вынесено из ChannelsService (CLAUDE.md «Храповики»):
// нужны не экрану CRUD, а другим потребителям — доставкам и боту (ADR-0015,
// чат сам становится каналом) и входу через Telegram (ADR-0026, автоподтверждение).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { ChannelConfig, ChannelDto, ChannelType } from '@xuanxue/shared';
import {
  CHANNEL_LIMITS,
  CHANNEL_NOT_FOUND_MESSAGE,
  LIST_LIMIT_MAX,
} from '@xuanxue/shared';
import { ClassRecord } from '../classes/class.schema';
import { NotFoundError } from '../common/errors';
import { encryptSchemaFrom } from '../common/field-policy';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { assertObjectId } from '../common/object-id';
import { decryptRecord, encryptRecord } from '../utils/encryption';
import { assertConfigForType } from './assert-channel-config';
import { CHANNEL_FIELD_POLICY, ChannelRecord } from './channel.schema';
import {
  targetOf,
  toChannelDto,
  type LeanChannel,
  type LeanChannelWithConfig,
} from './channel.mapper';

const ENCRYPT_SCHEMA = encryptSchemaFrom(CHANNEL_FIELD_POLICY);
const NOT_FOUND_MESSAGE = CHANNEL_NOT_FOUND_MESSAGE;

@Injectable()
export class ChannelConfigService {
  constructor(
    @InjectModel(ChannelRecord.name) private readonly model: Model<ChannelRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
  ) {}

  /** Расшифрованный config для отправки — не DTO, HTTP им не пользуется
   * (ответ идёт только через toChannelDto). Тем же способом его читает
   * ChannelsService.test() и DeliveryRunnerService. `active` — чтобы раннер
   * узнал о выключенном канале в момент отправки, а не только на создании
   * доставок: выключили между планированием и тиком — доставка cancelled,
   * не failed (docs/PLAN.md §6). */
  async readConfig(
    id: string,
  ): Promise<{ type: ChannelType; config: ChannelConfig; active: boolean }> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<LeanChannelWithConfig>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    const decrypted = decryptRecord(doc, ENCRYPT_SCHEMA);
    // decryptRecord — общая функция на все схемы (не параметризована по
    // конкретному полю): тип config после расшифровки остаётся `string`, как
    // в схеме, хотя на деле это уже разобранный JSON-объект — приводим явно.
    return {
      type: decrypted.type,
      config: decrypted.config as unknown as ChannelConfig,
      active: decrypted.active,
    };
  }

  /** Найти существующий Telegram-канал по chatId или создать новый —
   * идемпотентно (вызывает бот при my_chat_member, ADR-0015). insert первым,
   * при E11000 от гонки двух одновременных вызовов — читаем (и «оживляем»,
   * если чат раньше был кикнут) уже созданный документ по тому же
   * уникальному индексу (type, target), а не падаем и не создаём второй.
   * Подключение канала ко всем активным классам — ТОЛЬКО при создании нового
   * документа (docs/PLAN.md §6, без действий учителя): у существующего
   * канала учитель мог руками отключить лишние классы — повторное
   * добавление бота такое решение не отменяет, только оживляет active:true. */
  async upsertTelegramChat(input: {
    chatId: string;
    title: string;
  }): Promise<ChannelDto> {
    const config: ChannelConfig = { chatId: input.chatId };
    assertConfigForType('telegram', config);
    const target = targetOf('telegram', config);
    const title = input.title.slice(0, CHANNEL_LIMITS.title);
    const { doc, created } = await this.findOrReviveChannel(target, title, config);
    if (created) {
      await this.classModel.updateMany(
        { active: true },
        { $addToSet: { channelIds: doc._id } },
      );
    }
    return toChannelDto(doc);
  }

  /** chatId активных Telegram-каналов — для GroupMembershipService
   * (автоподтверждение по группе, ADR-0026). Лимит — LIST_LIMIT_MAX, «дай
   * всё» запрещён (CLAUDE.md «API»); `target` для telegram — это chatId. */
  async listActiveTelegramChatIds(): Promise<string[]> {
    const docs = await this.model
      .find({ type: 'telegram', active: true })
      .select('target')
      .limit(LIST_LIMIT_MAX)
      .lean<{ target: string }[]>();
    return docs.map((doc) => doc.target).filter(Boolean);
  }

  /** left/kicked (ADR-0015): документ не удаляем — журнал доставок на него
   * ссылается, только выключаем. Идемпотентно — повторный апдейт того же
   * статуса просто ничего не меняет. */
  async deactivateTelegramChat(chatId: string): Promise<void> {
    await this.model.updateOne(
      { type: 'telegram', target: chatId },
      { $set: { active: false } },
    );
  }

  /** `created: true` — только что вставленный документ (вызывающий код
   * подключает его ко всем активным классам); `created: false` — документ
   * уже существовал (E11000), только «оживлён» active:true и title. */
  private async findOrReviveChannel(
    target: string,
    title: string,
    config: ChannelConfig,
  ): Promise<{ doc: LeanChannel; created: boolean }> {
    const payload: Record<string, unknown> = {
      type: 'telegram',
      title,
      config,
      target,
      active: true,
    };
    try {
      const created = await this.model.create(encryptRecord(payload, ENCRYPT_SCHEMA));
      const doc = await this.model
        .findById(created._id)
        .select('-config')
        .lean<LeanChannel>();
      if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
      return { doc, created: true };
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      // Бот снова добавлен в чат, который раньше кикнул его (active:false) —
      // «оживляем» канал и обновляем название на случай, если чат переименован.
      const existing = await this.model
        .findOneAndUpdate(
          { type: 'telegram', target },
          { $set: { active: true, title } },
          { returnDocument: 'after' },
        )
        .select('-config')
        .lean<LeanChannel>();
      if (!existing) throw err;
      return { doc: existing, created: false };
    }
  }
}
