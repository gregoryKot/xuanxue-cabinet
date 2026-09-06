// Расшифрованный `config` и идемпотентный upsert Telegram-чата — вынесено из
// ChannelsService (194 строки, лимит 150, CLAUDE.md «Храповики»): оба метода
// нужны не экрану CRUD, а будущим потребителям — сервису доставок и боту
// (следующие PR), поэтому отдельный сервис, а не приватные методы CRUD-сервиса.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { ChannelConfig, ChannelDto, ChannelType } from '@xuanxue/shared';
import { CHANNEL_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
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
  ) {}

  /** Расшифрованный config для отправки — не DTO, HTTP им не пользуется
   * (ответ идёт только через toChannelDto). Тем же способом его читает
   * ChannelsService.test() и будущий сервис доставок. */
  async readConfig(id: string): Promise<{ type: ChannelType; config: ChannelConfig }> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<LeanChannelWithConfig>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    const decrypted = decryptRecord(doc, ENCRYPT_SCHEMA);
    // decryptRecord — общая функция на все схемы (не параметризована по
    // конкретному полю): тип config после расшифровки остаётся `string`, как
    // в схеме, хотя на деле это уже разобранный JSON-объект — приводим явно.
    return { type: decrypted.type, config: decrypted.config as unknown as ChannelConfig };
  }

  /** Найти существующий Telegram-канал по chatId или создать новый —
   * идемпотентно (вызовет бот при добавлении в группу, следующий PR): проверка
   * формы chatId первой строкой — пустой chatId не должен создавать документ
   * вне частичного индекса (target: '' конкурировал бы со всеми manual-каналами).
   * insert первым, при E11000 от гонки двух одновременных вызовов — читаем уже
   * созданный документ по тому же уникальному индексу (type, target), а не
   * падаем и не создаём второй. */
  async upsertTelegramChat(input: {
    chatId: string;
    title: string;
  }): Promise<ChannelDto> {
    const config: ChannelConfig = { chatId: input.chatId };
    assertConfigForType('telegram', config);
    const target = targetOf('telegram', config);
    const payload: Record<string, unknown> = {
      type: 'telegram',
      title: input.title,
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
      return toChannelDto(doc);
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const existing = await this.model
        .findOne({ type: 'telegram', target })
        .select('-config')
        .lean<LeanChannel>();
      if (!existing) throw err;
      return toChannelDto(existing);
    }
  }
}
