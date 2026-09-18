// Подписи статусов и видов рассылки/доставки — по VOICE.md (конкретика, без
// канцелярита). Один источник для карточки рассылки и карточки доставки.
import type { BroadcastKind, BroadcastStatus, DeliveryStatus } from '@xuanxue/shared';

export const BROADCAST_STATUS_LABELS_RU: Record<BroadcastStatus, string> = {
  scheduled: 'Ждёт отправки',
  sent: 'Отправлено',
  failed: 'Не отправлено',
  cancelled: 'Отменено',
};

// Цвет меты строки журнала (BroadcastCard.tsx, docs/adr/0043) — тот же приём,
// что у --jade в index.css («только смысл сдал/верно»), перенесённый на
// «доставлено успешно»; --danger читается как «нужно вмешаться».
export const BROADCAST_STATUS_COLOR: Record<BroadcastStatus, string> = {
  scheduled: 'var(--ink-soft)',
  sent: 'var(--jade)',
  failed: 'var(--danger)',
  cancelled: 'var(--ink-soft)',
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
