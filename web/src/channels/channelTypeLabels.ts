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
  // Каналом webpush этот экран не управляет (создаётся подпиской, не формой,
  // ChannelCard его карточку не делает кликабельной) — настоящая подпись
  // канала, а не служебное «Push-уведомления» (ревью п.14).
  webpush: 'Push',
};

/** Типы, которые можно создать/править на этом экране — источник правды
 * CHANNEL_TYPES (shared/src/domain.ts), не отдельный литерал: расхождение со
 * списком типов заметит tsc, а не ревью. webpush подключается своей
 * подпиской (CreateChannelInput его не принимает). */
export const CREATABLE_CHANNEL_TYPES = CHANNEL_TYPES.filter(
  (type): type is CreateChannelInput['type'] => type !== 'webpush',
);
