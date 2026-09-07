// Подписи статусов и видов рассылки/доставки — по VOICE.md (конкретика, без
// канцелярита). Один источник для карточки рассылки и карточки доставки.
import type { BroadcastKind, BroadcastStatus, DeliveryStatus } from '@xuanxue/shared';

export const BROADCAST_STATUS_LABELS_RU: Record<BroadcastStatus, string> = {
  scheduled: 'Ждёт отправки',
  sent: 'Отправлено',
  failed: 'Не отправлено',
  cancelled: 'Отменено',
};

export const BROADCAST_KIND_LABELS_RU: Record<BroadcastKind, string> = {
  lesson_link: 'Ссылка на занятие',
  recording: 'Запись',
  manual: 'Разовая рассылка',
};

export const DELIVERY_STATUS_LABELS_RU: Record<DeliveryStatus, string> = {
  pending: 'Ждёт отправки',
  sending: 'Отправляется',
  sent: 'Отправлено',
  failed: 'Не отправлено',
  manual: 'Ждёт вас',
  cancelled: 'Отменено',
};
