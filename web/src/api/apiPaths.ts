// Пути GET-запросов, общие для хука данных экрана и таблицы предзагрузки
// (routeModules.ts, prefetchFirstScreen.ts) — одна функция вместо двух
// литералов: разъехавшись, они сломали бы ключ кэша prefetchCache.ts (apiFetch
// сравнивает строки пути). Путь только для своего хука — остаётся в хуке.
import {
  LIST_LIMIT_DEFAULT,
  LIST_LIMIT_MAX,
  type ExamItemStatus,
  type ListMaterialsQuery,
  type MaterialKind,
} from '@xuanxue/shared';
import { planningLessonsQuery } from '../planning/planningWindow';
import { nextLessonsQuery } from '../templates/nextLessonsWindow';
import { apiRoutePath } from './apiRoute';
import {
  CLASSES_LIST_QUERY,
  EXAM_EDITOR_ITEMS_QUERY,
  channelsListQuery,
  examItemsListQuery,
  examsListQuery,
  type ExamListFilters,
} from './listQueries';

export const CLASSES_PATH = '/classes';
/** Строка пути — для таблицы предзагрузки: ключ кэша prefetchCache.ts должен
 * совпасть с тем, что соберёт `apiRoute` в useClasses.ts (query — listQueries.ts). */
export const CLASSES_LIST_PATH = apiRoutePath('GET /classes', {
  query: CLASSES_LIST_QUERY,
});

export const LESSONS_PATH = '/lessons';
/** Число раздела «Занятия» (docs/PLAN.md §14, слой 3.5) — строка пути для
 * предзагрузки, хук зовёт `apiRoute` по ключу (PLAN §17.1). */
export const LESSON_RECORDING_SUMMARY_PATH = apiRoutePath(
  'GET /lessons/recording-summary',
);

/** Окно «Планирования» — от начала текущей недели (planningWindow.ts).
 * Предзагрузка и хук экрана (useLessons.ts, тот же planningLessonsQuery)
 * вызывают её с разницей в секунды
 * и почти всегда получают одну и ту же строку; разойтись они могут только в
 * момент перехода недели (полночь воскресенья по браузеру) — тогда хук
 * просто не находит готовый промис в кэше (ключ не совпал) и сам идёт в
 * сеть, как без предзагрузки. */
export function lessonsListPath(now?: Date): string {
  return apiRoutePath('GET /lessons', { query: planningLessonsQuery(now) });
}

export const EXAMS_PATH = '/exams';

export function examsListPath(filters: ExamListFilters): string {
  return apiRoutePath('GET /exams', { query: examsListQuery(filters) });
}

export const EXAM_ITEMS_PATH = '/exam-items';
export const EXAM_ITEM_STATS_SUMMARY_PATH = apiRoutePath('GET /exam-items/stats-summary');

const EXAM_IMAGES_PATH = '/exam-images';

/** Адрес картинки варианта для `<img src>` (ADR-0035) — единственное место
 * вне http.ts, где вручную собирается `/api`: это не запрос через apiFetch
 * (JSON, конверт ошибок), а адрес ресурса, который сам загружает браузер, и
 * кэширует его навсегда (`Cache-Control: immutable` на бэкенде). */
export function examImageSrc(imageId: string): string {
  return `/api${EXAM_IMAGES_PATH}/${imageId}`;
}

/** Пустой статус — «Все» (тот же приём, что раньше жил в useExamItems.ts). */
export function examItemsListPath(status: ExamItemStatus | ''): string {
  return apiRoutePath('GET /exam-items', { query: examItemsListQuery(status) });
}
/** Редактор и предпросмотр экзамена — с удалёнными из списка вопросов (ADR-0140). */
export const EXAM_EDITOR_ITEMS_PATH = apiRoutePath('GET /exam-items', {
  query: EXAM_EDITOR_ITEMS_QUERY,
});

export const CHANNELS_PATH = '/channels';

/** `activeOnly` — «Каналы» показывает все (по умолчанию); «Расписание» и
 * страница занятия расписания выбирают только активные Telegram-каналы для
 * рассылки (docs/PLAN.md §6 п.1). */
export function channelsListPath(activeOnly: boolean): string {
  return apiRoutePath('GET /channels', { query: channelsListQuery(activeOnly) });
}

export const MATERIALS_PATH = '/materials';

/** Пустой вид или тег — «Все» (тот же приём, что у examItemsListPath); пустое
 * поле в query не попадает. Порядок полей — ключ кэша предзагрузки. Без тега —
 * тот же список, что берёт подсказка тегов (useTagOptions.ts): рубрикация
 * школы не зависит от фильтра экрана. */
export function materialsListQuery(
  kind: MaterialKind | '',
  tag: string,
): ListMaterialsQuery {
  return { limit: LIST_LIMIT_MAX, kind: kind || undefined, tag: tag || undefined };
}

export function materialsListPath(kind: MaterialKind | '', tag: string = ''): string {
  return apiRoutePath('GET /materials', { query: materialsListQuery(kind, tag) });
}

/** Файл материала в R2 (ADR-0057, слой 3.10) — адрес для `<a href>`
 * (MaterialFileField.tsx, StudentMaterialCardActions.tsx), `/api` браузеру
 * добавляют вручную: сервер отвечает 302 на подписанный адрес в другом
 * домене, открывает его переходом сам браузер — тот же приём, что у
 * examImageSrc выше. Загрузка и удаление идут по карте (`POST`/`DELETE
 * /materials/:id/file`). */
export function materialFilePath(materialId: string): string {
  return `${MATERIALS_PATH}/${materialId}/file`;
}

/** Строка пути — для таблицы предзагрузки: ключ кэша prefetchCache.ts должен
 * совпасть с тем, что соберёт `apiRoute` в useSettings.ts (PLAN §17.1). */
export const SETTINGS_PATH = apiRoutePath('GET /settings');

/** Ближайшие занятия для предпросмотра шаблона (docs/PLAN.md §6) — окно от
 * текущего момента, а не от начала недели, поэтому не lessonsListPath().
 * Строка пути — для предзагрузки; сам запрос идёт по карте (useNextLessons.ts)
 * с тем же nextLessonsQuery: порядок полей в нём и есть ключ кэша. */
export function nextLessonsPath(): string {
  return apiRoutePath('GET /lessons', { query: nextLessonsQuery() });
}

/** Строка пути — только для таблицы предзагрузки, как NOTIFICATIONS_FEED_PATH
 * ниже: хук зовёт `apiRoute` по ключу (PLAN §17.1). */
export const NOTIFICATION_PREFS_PATH = apiRoutePath('GET /me/notifications');

/** Лента центра уведомлений (ADR-0063) — своё имя ресурса: `/me/notifications`
 * выше занят настройкой «что присылать», и лента под ним читалась бы её частью. */
export const NOTIFICATIONS_FEED_QUERY = { limit: LIST_LIMIT_DEFAULT };
/** Строка пути — только для таблицы предзагрузки: ключ кэша prefetchCache.ts
 * должен совпасть с тем, что соберёт `apiRoute` хука ленты. Сам запрос идёт
 * по карте (useNotificationsData.ts, PLAN §17.1). */
export const NOTIFICATIONS_FEED_PATH = apiRoutePath('GET /me/inbox', {
  query: NOTIFICATIONS_FEED_QUERY,
});

export const TEACHERS_PATH = apiRoutePath('GET /users/teachers');
export const INVITE_LINK_PATH = apiRoutePath('GET /users/invite-link');

// Экраны ученика: строки путей — для таблицы предзагрузки, хуки зовут
// `apiRoute` по ключу (PLAN §17.1). Лимит не передаётся — сервер сам берёт
// свой MY_*_LIMIT_DEFAULT.
export const MY_LESSONS_PATH = apiRoutePath('GET /me/lessons');
/** Архив прошедших занятий (docs/PLAN.md §14 слой 3.3) — тот же ресурс назад
 * по времени. */
export const MY_LESSONS_ARCHIVE_PATH = apiRoutePath('GET /me/lessons/archive');
export const MY_EXAMS_PATH = apiRoutePath('GET /me/exams');
/** Библиотека материалов глазами ученика (docs/PLAN.md §14 слой 3.2). */
export const MY_MATERIALS_PATH = apiRoutePath('GET /me/materials');
