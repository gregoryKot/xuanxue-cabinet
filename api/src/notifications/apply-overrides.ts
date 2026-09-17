// Слияние дефолта роли и ручных переключений (ТЗ notifications-api.md,
// NotificationPrefsService.get) — чистая логика без Mongo, тест рядом
// (CLAUDE.md «Тесты», уровень «чистая логика»). `enabled: true` в overrides
// добавляет вид уведомления, даже если дефолт роли его не включал;
// `enabled: false` убирает, даже если включал. Порядок результата —
// канонический (`NOTIFICATION_KINDS`), не порядок вставки overrides.
import { NOTIFICATION_KINDS, type NotificationKind } from '@xuanxue/shared';

export interface NotificationOverride {
  kind: NotificationKind;
  enabled: boolean;
}

export function applyOverrides(
  defaults: NotificationKind[],
  overrides: NotificationOverride[],
): NotificationKind[] {
  const enabled = new Set(defaults);
  for (const override of overrides) {
    if (override.enabled) enabled.add(override.kind);
    else enabled.delete(override.kind);
  }
  return NOTIFICATION_KINDS.filter((kind) => enabled.has(kind));
}
