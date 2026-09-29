// Query списков, которые читают и хук экрана (`apiRoute`), и таблица
// предзагрузки (apiPaths.ts → routeModules.ts): порядок полей здесь — порядок
// в строке пути, а строка пути — ключ кэша prefetchCache.ts, поэтому query
// живёт в одном месте (PLAN §17.1). `undefined` — «не слать» (apiRoute.ts).
import { LIST_LIMIT_MAX, type ExamItemStatus, type ExamStatus } from '@xuanxue/shared';

/** Фильтры списка экзаменов — общая форма для useExams.ts (хук) и
 * examsListPath (предзагрузка); ExamsScreen.tsx использует то же имя. */
export interface ExamListFilters {
  status: ExamStatus | '';
}

export const CLASSES_LIST_QUERY = { limit: LIST_LIMIT_MAX };

export function examsListQuery(filters: ExamListFilters) {
  return { limit: LIST_LIMIT_MAX, status: filters.status || undefined };
}

/** Пустой статус — «Все» (тот же приём, что раньше жил в useExamItems.ts). */
export function examItemsListQuery(status: ExamItemStatus | '') {
  return { limit: LIST_LIMIT_MAX, status: status || undefined };
}

/** Редактор и предпросмотр экзамена — с удалёнными из списка вопросов (ADR-0140). */
export const EXAM_EDITOR_ITEMS_QUERY = { limit: LIST_LIMIT_MAX, includeDeleted: true };

/** `activeOnly` — «Каналы» показывает все (по умолчанию); «Расписание» и
 * страница занятия расписания выбирают только активные Telegram-каналы для
 * рассылки (docs/PLAN.md §6 п.1). */
export function channelsListQuery(activeOnly: boolean) {
  return { active: activeOnly || undefined, limit: LIST_LIMIT_MAX };
}
