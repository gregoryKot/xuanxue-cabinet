// Начальный статус фильтра журнала «Рассылки» из query-параметра ?status=…
// (карточка «Отменено автоматикой» в BroadcastsSummary.tsx ведёт сюда
// ссылкой /broadcasts?status=cancelled). Чистая функция — юнит-тест без DOM
// (CLAUDE.md «Тесты»), используется в BroadcastsScreen.tsx один раз при
// первом рендере (useState с ленивым инициализатором), дальше фильтр меняют
// только BroadcastFilters, URL обратно не синхронизируем.
import { BROADCAST_STATUSES, type BroadcastStatus } from '@xuanxue/shared';

/** Значение вне BROADCAST_STATUSES (чужой/битый параметр, параметра нет) —
 * как будто фильтра не было, не падаем. */
export function initialStatusFromQuery(value: string | null): BroadcastStatus | '' {
  return value && (BROADCAST_STATUSES as readonly string[]).includes(value)
    ? (value as BroadcastStatus)
    : '';
}
