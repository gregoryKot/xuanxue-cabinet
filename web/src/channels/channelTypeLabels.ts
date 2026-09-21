// Подписи типа канала по-русски — один источник для карточки и формы
// (CLAUDE.md «Без магических чисел и строк»).
import {
  CHANNEL_TYPES,
  type ChannelType,
  type CreateChannelInput,
} from '@xuanxue/shared';

export const CHANNEL_TYPE_LABELS_RU: Record<ChannelType, string> = {
  telegram: 'Telegram',
  vk: 'ВК',
  manual: 'Вручную',
};

/** Типы, которые можно создать/править на этом экране. Отдельного литерала
 * нет — источник правды CHANNEL_TYPES (shared/src/domain.ts): новый тип
 * канала появится в форме сам, а расхождение заметит tsc, не ревью. */
export const CREATABLE_CHANNEL_TYPES: readonly CreateChannelInput['type'][] =
  CHANNEL_TYPES;
