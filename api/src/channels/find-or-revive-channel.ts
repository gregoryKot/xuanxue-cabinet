// Идемпотентный insert-или-revive одного Telegram-канала (ADR-0015) —
// вынесено из ChannelConfigService (CLAUDE.md «Храповики»): используется и
// каналом школы (upsertTelegramChat — весь штат, подключение ко всем активным
// классам), и личным каналом ученика (upsertPersonalTelegramChat, ADR-0027 —
// без подключения к классам), чтобы обе ветки не разъезжались в одной и той
// же гонке insert/E11000.
import type { Model } from 'mongoose';
import type { ChannelConfig } from '@xuanxue/shared';
import { CHANNEL_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { encryptSchemaFrom } from '../common/field-policy';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { encryptRecord } from '../utils/encryption';
import { CHANNEL_FIELD_POLICY, ChannelRecord } from './channel.schema';
import type { LeanChannel } from './channel.mapper';

const ENCRYPT_SCHEMA = encryptSchemaFrom(CHANNEL_FIELD_POLICY);

/** `created: true` — только что вставленный документ (вызывающий код решает,
 * что делать дальше — подключать к классам или нет); `created: false` —
 * документ уже существовал (E11000), только «оживлён» active:true и title.
 * `extra` — поля, которые нужны только при СОЗДАНИИ (например,
 * `broadcastEligible: false` у личного канала ученика): на revive их не
 * трогаем — учитель мог с тех пор изменить решение о канале руками, а бот
 * заново нажатым /start его не отменяет (тот же принцип, что и у
 * отключённых классов ниже). */
export async function findOrReviveChannel(
  model: Model<ChannelRecord>,
  target: string,
  title: string,
  config: ChannelConfig,
  extra: Record<string, unknown> = {},
): Promise<{ doc: LeanChannel; created: boolean }> {
  const payload: Record<string, unknown> = {
    type: 'telegram',
    title,
    config,
    target,
    active: true,
    ...extra,
  };
  try {
    const created = await model.create(encryptRecord(payload, ENCRYPT_SCHEMA));
    const doc = await model.findById(created._id).select('-config').lean<LeanChannel>();
    if (!doc) throw new NotFoundError(CHANNEL_NOT_FOUND_MESSAGE);
    return { doc, created: true };
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    // Бот снова добавлен в чат, который раньше кикнул его (active:false) —
    // «оживляем» канал и обновляем название на случай, если чат переименован.
    const existing = await model
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
