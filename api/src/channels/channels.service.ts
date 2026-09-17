// CRUD каналов (данные школы, ADR-0010) плюс test(). `config` наружу не
// отдаётся никогда (SECURITY §3) — для адаптера его читает
// ChannelConfigService (там же upsertTelegramChat() для бота/доставок).
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  ChannelDto,
  ChannelTestResult,
  ChannelType,
  CreateChannelInput,
  ListChannelsQuery,
  UpdateChannelInput,
} from '@xuanxue/shared';
import { CHANNEL_NOT_FOUND_MESSAGE, LIST_LIMIT_DEFAULT } from '@xuanxue/shared';
import { ClassRecord } from '../classes/class.schema';
import { ConflictError, NotFoundError } from '../common/errors';
import { encryptSchemaFrom } from '../common/field-policy';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { assertObjectId } from '../common/object-id';
import { encryptRecord } from '../utils/encryption';
import { assertConfigForType } from './assert-channel-config';
import { ChannelAdapterRegistry } from './channel-adapter.registry';
import { ChannelConfigService } from './channel-config.service';
import { scrubChannelSecrets } from './channel-secrets';
import { CHANNEL_FIELD_POLICY, ChannelRecord } from './channel.schema';
import { targetOf, toChannelDto, type LeanChannel } from './channel.mapper';

const ENCRYPT_SCHEMA = encryptSchemaFrom(CHANNEL_FIELD_POLICY);
const NOT_FOUND_MESSAGE = CHANNEL_NOT_FOUND_MESSAGE;
const IN_USE_MESSAGE = 'Канал подключён к занятиям. Сначала отключите его от них.';
const DUPLICATE_MESSAGE =
  'Этот канал уже подключён. Откройте его в списке или укажите другой адрес.';
// VOICE.md: конкретика — учитель узнаёт школу в тексте теста. Не
// экспортируется: e2e держит свою копию (комментарий там же — почему).
const TEST_MESSAGE = 'Проверка связи: кабинет школы Сюань-Сюэ подключён к этому каналу';

@Injectable()
export class ChannelsService {
  constructor(
    @InjectModel(ChannelRecord.name) private readonly model: Model<ChannelRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    private readonly config: ConfigService,
    private readonly adapters: ChannelAdapterRegistry,
    private readonly channelConfig: ChannelConfigService,
  ) {}

  async list(query: ListChannelsQuery): Promise<ChannelDto[]> {
    // Личный канал ученика (broadcastEligible: false, ADR-0027) на этот
    // экран не попадает: это не канал школы, у него нет своей карточки в
    // «Каналах», и учитель не должен видеть в списке личные чаты учеников.
    const filter: Record<string, unknown> = { broadcastEligible: { $ne: false } };
    if (query.active !== undefined) filter.active = query.active;
    const docs = await this.model
      .find(filter)
      .select('-config')
      .collation({ locale: 'ru' })
      .sort({ title: 1 })
      .limit(query.limit ?? LIST_LIMIT_DEFAULT)
      .lean<LeanChannel[]>();
    return docs.map(toChannelDto);
  }

  async getById(id: string): Promise<ChannelDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).select('-config').lean<LeanChannel>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toChannelDto(doc);
  }

  async create(input: CreateChannelInput): Promise<ChannelDto> {
    assertConfigForType(input.type, input.config);
    const target = targetOf(input.type, input.config);
    // Record<string, unknown> явно: тело уже проверено ValidationPipe.
    const payload: Record<string, unknown> = {
      type: input.type,
      title: input.title,
      config: input.config,
      target,
      active: true,
    };
    const created = await this.withDuplicateGuard(() =>
      this.model.create(encryptRecord(payload, ENCRYPT_SCHEMA)),
    );
    return this.getById(created._id.toString());
  }

  async update(id: string, input: UpdateChannelInput): Promise<ChannelDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const $set: Record<string, unknown> = { ...input };
    if (input.config !== undefined) {
      const type = await this.typeOf(id);
      assertConfigForType(type, input.config);
      $set.target = targetOf(type, input.config);
    }

    const doc = await this.withDuplicateGuard(() =>
      this.model
        .findOneAndUpdate(
          { _id: id },
          { $set: encryptRecord($set, ENCRYPT_SCHEMA) },
          { returnDocument: 'after' },
        )
        .select('-config')
        .lean<LeanChannel>(),
    );
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toChannelDto(doc);
  }

  async remove(id: string): Promise<void> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const inUse = await this.classModel.exists({ channelIds: id });
    if (inUse) throw new ConflictError(IN_USE_MESSAGE);
    const { deletedCount } = await this.model.deleteOne({ _id: id });
    if (deletedCount === 0) throw new NotFoundError(NOT_FOUND_MESSAGE);
  }

  /** Тестовое сообщение через настоящий адаптер (PLAN §6). `error` — уже без
   * токена: scrub здесь один раз, до ответа клиенту (SECURITY §6). */
  async test(id: string): Promise<ChannelTestResult> {
    const { type, config } = await this.channelConfig.readConfig(id);
    const adapter = this.adapters.get(type);
    const result = await adapter.send({ text: TEST_MESSAGE }, config);
    if (result.status === 'failed') {
      const botToken = this.config.get<string>('BOT_TOKEN');
      return {
        status: 'failed',
        error: scrubChannelSecrets(result.error, config, botToken),
      };
    }
    return { status: result.status };
  }

  // Дубль (type, target) — понятная ошибка вместо 500 от драйвера, одна на create()/update().
  private async withDuplicateGuard<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      if (isDuplicateKeyError(err)) throw new ConflictError(DUPLICATE_MESSAGE);
      throw err;
    }
  }

  private async typeOf(id: string): Promise<ChannelType> {
    const doc = await this.model
      .findById(id)
      .select('type')
      .lean<{ type: ChannelType } | null>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return doc.type;
  }
}
