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
import { assertObjectId } from '../common/object-id';
import { decryptRecord } from '../utils/encryption';
import { assertConfigForType } from './assert-channel-config';
import { CHANNEL_FIELD_POLICY, ChannelRecord } from './channel.schema';
import { findOrReviveChannel } from './find-or-revive-channel';
import { targetOf, toChannelDto, type LeanChannelWithConfig } from './channel.mapper';

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
    const { doc, created } = await findOrReviveChannel(this.model, target, title, config);
    if (created) {
      await this.classModel.updateMany(
        { active: true },
        { $addToSet: { channelIds: doc._id } },
      );
    }
    return toChannelDto(doc);
  }

  /** Личный канал ОДНОГО ученика по /start (ADR-0027, docs/PLAN.md §11
   * слой 4.7) — тот же идемпотентный upsert, что и у канала школы выше, но
   * ДВЕ разницы намеренно: `broadcastEligible: false` (только при создании —
   * см. комментарий в findOrReviveChannel про revive) и НИКАКОГО подключения
   * к классам. Иначе первый же /start ученика превратил бы его личный чат в
   * получателя рассылок всех занятий школы (нашлось на аудите 2026-09-15:
   * `PersonalChats.chatFor` для ученика всегда отдавал `null`, потому что
   * канал в принципе не заводился, — этот метод и закрывает разрыв). */
  async upsertPersonalTelegramChat(input: {
    chatId: string;
    title: string;
  }): Promise<ChannelDto> {
    const config: ChannelConfig = { chatId: input.chatId };
    assertConfigForType('telegram', config);
    const target = targetOf('telegram', config);
    const title = input.title.slice(0, CHANNEL_LIMITS.title);
    const { doc } = await findOrReviveChannel(this.model, target, title, config, {
      broadcastEligible: false,
    });
    return toChannelDto(doc);
  }

  /** chatId активных Telegram-каналов ШКОЛЫ — для GroupMembershipService
   * (автоподтверждение по группе, ADR-0026). Личные каналы учеников
   * (`broadcastEligible: false`, ADR-0027) сюда не попадают: это не группы,
   * проверять членство в них незачем и небезопасно тратить вызовы Bot API.
   * Лимит — LIST_LIMIT_MAX, «дай всё» запрещён (CLAUDE.md «API»); `target`
   * для telegram — это chatId. */
  async listActiveTelegramChatIds(): Promise<string[]> {
    const docs = await this.model
      .find({ type: 'telegram', active: true, broadcastEligible: { $ne: false } })
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
}
