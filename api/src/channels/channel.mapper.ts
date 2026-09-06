// Единственный маппер ChannelRecord (lean, уже расшифрованный) → ChannelDto
// (CLAUDE.md, раздел «API»: документ Mongoose наружу не возвращается).
// `config` сюда никогда не попадает — ни расшифрованный, ни как есть
// (SECURITY §3, §8: секрет канала не покидает сервер ни для одной роли).
import type { Types } from 'mongoose';
import {
  isTelegramChannelConfig,
  isVkChannelConfig,
  type ChannelConfig,
  type ChannelDto,
  type ChannelType,
} from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { ChannelRecord } from './channel.schema';

export type LeanChannel = Omit<ChannelRecord, 'config'> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

/** Только для чтения расшифрованного config на сервере (ChannelsService.readConfig) —
 * HTTP-ответ им никогда не пользуется, для него — LeanChannel выше без config. */
export type LeanChannelWithConfig = LeanChannel & { config: string };

/** `target` — производное поле, не хранит секрет: chatId для telegram,
 * String(peerId) для ВК, '' для ручного канала. Сервис вызывает её же перед
 * записью (channels.service.ts), маппер — перед ответом, чтобы оба места не
 * разошлись в логике вычисления. */
export function targetOf(type: ChannelType, config: ChannelConfig): string {
  switch (type) {
    case 'telegram':
      return isTelegramChannelConfig(config) ? config.chatId : '';
    case 'vk':
      return isVkChannelConfig(config) ? String(config.peerId) : '';
    case 'manual':
      return '';
    case 'webpush':
      // Push пока без своего эндпоинта канала (PLAN §3) — этот адрес не
      // строка chatId/peerId, а capability-URL подписки; появится вместе с
      // адаптером webpush.
      return '';
  }
}

export function toChannelDto(doc: LeanChannel): ChannelDto {
  return {
    id: doc._id.toString(),
    type: doc.type,
    title: doc.title,
    active: doc.active,
    // Страховка для документов, созданных до появления поля target в схеме —
    // `doc.target` из старой записи может быть undefined, DTO его не отдаёт.
    target: doc.target ?? '',
    createdAt: toIsoUtc(doc.createdAt),
    updatedAt: toIsoUtc(doc.updatedAt),
  };
}
