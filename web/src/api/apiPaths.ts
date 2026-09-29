// Пути GET-запросов, общие для хука данных экрана и таблицы предзагрузки
// (routeModules.ts, prefetchFirstScreen.ts) — одна функция вместо двух
// литералов: разъехавшись, они сломали бы ключ кэша prefetchCache.ts (apiFetch
// сравнивает строки пути). Путь только для своего хука — остаётся в хуке.
import {
  LIST_LIMIT_DEFAULT,
  LIST_LIMIT_MAX,
  type ExamItemStatus,
  type MaterialKind,
} from '@xuanxue/shared';
import { planningWindow } from '../planning/planningWindow';
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
/** Число раздела «Занятия» (docs/PLAN.md §14, слой 3.5) — по образцу
 * EXAM_ITEM_STATS_SUMMARY_PATH. */
export const LESSON_RECORDING_SUMMARY_PATH = `${LESSONS_PATH}/recording-summary`;

/** Окно «Планирования» — от начала текущей недели (planningWindow.ts).
 * Предзагрузка и хук экрана (useLessons.ts) вызывают её с разницей в секунды
 * и почти всегда получают одну и ту же строку; разойтись они могут только в
 * момент перехода недели (полночь воскресенья по браузеру) — тогда хук
 * просто не находит готовый промис в кэше (ключ не совпал) и сам идёт в
 * сеть, как без предзагрузки. */
export function lessonsListPath(now?: Date): string {
  const { from, to } = planningWindow(now);
  return `${LESSONS_PATH}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=${LIST_LIMIT_MAX}`;
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

/** Пустой вид или тег — «Все» (тот же приём, что у examItemsListPath). Без
 * аргумента тега — тот же путь, что даёт список для подсказки тегов
 * (useTagOptions.ts): рубрикация школы не зависит от фильтра экрана. */
export function materialsListPath(kind: MaterialKind | '', tag: string = ''): string {
  const params = [`limit=${LIST_LIMIT_MAX}`];
  if (kind) params.push(`kind=${kind}`);
  if (tag) params.push(`tag=${encodeURIComponent(tag)}`);
  return `${MATERIALS_PATH}?${params.join('&')}`;
}

/** Файл материала в R2 (ADR-0057, слой 3.10) — один адрес у скачивания,
 * замены и удаления (`GET`/`POST`/`DELETE /materials/:id/file`), путь
 * относительный для `apiFetch`. Прямая ссылка на скачивание (`<a href>`,
 * MaterialFileField.tsx) собирает `/api` вручную: сервер отвечает 302 на
 * подписанный адрес в другом домене, открывает его переходом сам браузер —
 * тот же приём, что у examImageSrc выше. */
export function materialFilePath(materialId: string): string {
  return `${MATERIALS_PATH}/${materialId}/file`;
}

/** Адрес загрузки/замены файла — имя в query, сервер берёт его оттуда, не
 * из тела: тело POST — сырые байты файла, без обёртки JSON (ADR-0057). */
export function materialFileUploadPath(materialId: string, name: string): string {
  return `${materialFilePath(materialId)}?name=${encodeURIComponent(name)}`;
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

export const MY_LESSONS_PATH = '/me/lessons';
/** Архив прошедших занятий ученика (docs/PLAN.md §14 слой 3.3) — тот же
 * ресурс назад по времени, отдельный путь с суффиксом `archive`. */
export const MY_LESSONS_ARCHIVE_PATH = `${MY_LESSONS_PATH}/archive`;
export const MY_EXAMS_PATH = '/me/exams';
/** Отметка «ученик открыл карточку задания» (ADR-0129) — гасит пилюлю у
 * колокольчика раньше старта попытки. */
export function examSeenPath(examId: string): string {
  return `${MY_EXAMS_PATH}/${examId}/seen`;
}
/** Библиотека материалов глазами ученика (docs/PLAN.md §14 слой 3.2) —
 * без своего лимита: сервер сам берёт MY_MATERIALS_LIMIT_DEFAULT, тот же
 * приём, что у MY_LESSONS_ARCHIVE_PATH. */
export const MY_MATERIALS_PATH = '/me/materials';

/** Путь одной записи коллекции — для мест, которых ещё нет в карте маршрутов
 * (PLAN §17.1): редакторы `hooks/useEntityEditor.ts` ходят по ключам карты. */
export function entityPath(collectionPath: string, id: string): string {
  return `${collectionPath}/${id}`;
}
