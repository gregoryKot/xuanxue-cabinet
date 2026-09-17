// Пути GET-запросов, общие для хука данных экрана и таблицы предзагрузки
// (routeModules.ts, prefetchFirstScreen.ts): путь строится одной функцией, а
// не двумя похожими литералами в разных файлах. Два литерала разъехались бы
// на первой же правке лимита или фильтра — и prefetchCache.ts никогда не
// отдал бы готовый промис хуку, потому что ключ там — сам путь (apiFetch
// сравнивает строки, не структуру запроса). Путь, нужный только своему хуку
// (мутация, адрес, которого нет на первом экране) — остаётся в хуке.
import { LIST_LIMIT_MAX, type ExamItemStatus, type ExamStatus } from '@xuanxue/shared';
import { planningWindow } from '../planning/planningWindow';
import { nextLessonsWindow } from '../templates/nextLessonsWindow';

/** Фильтры списка экзаменов — общая форма для useExams.ts (хук) и
 * examsListPath (предзагрузка); ExamsScreen.tsx использует то же имя. */
export interface ExamListFilters {
  status: ExamStatus | '';
}

export const CLASSES_PATH = '/classes';
export const CLASSES_LIST_PATH = `${CLASSES_PATH}?limit=${LIST_LIMIT_MAX}`;

export const LESSONS_PATH = '/lessons';

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
  const params = [`limit=${LIST_LIMIT_MAX}`];
  if (filters.status) params.push(`status=${filters.status}`);
  return `${EXAMS_PATH}?${params.join('&')}`;
}

export const EXAM_ITEMS_PATH = '/exam-items';
export const EXAM_ITEM_STATS_SUMMARY_PATH = `${EXAM_ITEMS_PATH}/stats-summary`;

export const EXAM_IMAGES_PATH = '/exam-images';
export const EXAM_IMAGE_STATS_PATH = `${EXAM_IMAGES_PATH}/stats-summary`;

/** Адрес картинки варианта для `<img src>` (ADR-0035) — единственное место
 * вне http.ts, где вручную собирается `/api`: это не запрос через apiFetch
 * (JSON, конверт ошибок), а адрес ресурса, который сам загружает браузер, и
 * кэширует его навсегда (`Cache-Control: immutable` на бэкенде). */
export function examImageSrc(imageId: string): string {
  return `/api${EXAM_IMAGES_PATH}/${imageId}`;
}

/** Пустой статус — «Все» (тот же приём, что раньше жил в useExamItems.ts). */
export function examItemsListPath(status: ExamItemStatus | ''): string {
  const limit = `limit=${LIST_LIMIT_MAX}`;
  return status
    ? `${EXAM_ITEMS_PATH}?${limit}&status=${status}`
    : `${EXAM_ITEMS_PATH}?${limit}`;
}

const ATTEMPTS_PATH = '/attempts';
export const ATTEMPTS_LIST_PATH = `${ATTEMPTS_PATH}?limit=${LIST_LIMIT_MAX}`;
export const GRADING_QUEUE_PATH = `${ATTEMPTS_PATH}?status=submitted&limit=${LIST_LIMIT_MAX}`;

export function attemptReviewPath(attemptId: string): string {
  return `${ATTEMPTS_PATH}/${attemptId}/review`;
}

/** Заготовки частых комментариев при проверке (слой 4.6, ADR-0041) — общий
 * список школы, читают и «Экзамены» (число раздела), и карточка проверки
 * (GradingCommentPresets.tsx). */
export const GRADING_PRESETS_PATH = '/grading-presets';
export const GRADING_PRESETS_LIST_PATH = `${GRADING_PRESETS_PATH}?limit=${LIST_LIMIT_MAX}`;

export const CHANNELS_PATH = '/channels';

/** `activeOnly` — «Каналы» показывает все (по умолчанию); «Расписание» и
 * страница занятия расписания выбирают только активные Telegram-каналы для
 * рассылки (docs/PLAN.md §6 п.1). */
export function channelsListPath(activeOnly: boolean): string {
  const limit = `limit=${LIST_LIMIT_MAX}`;
  return activeOnly
    ? `${CHANNELS_PATH}?active=true&${limit}`
    : `${CHANNELS_PATH}?${limit}`;
}

export const SETTINGS_PATH = '/settings';

const NEXT_LESSONS_LIMIT = 5;

/** Ближайшие занятия для выбора в предпросмотре шаблона (docs/PLAN.md §6
 * «Шаблоны») — окно от текущего момента, а не от начала недели
 * (nextLessonsWindow.ts), поэтому своя функция, не lessonsListPath(). */
export function nextLessonsPath(): string {
  const { from, to } = nextLessonsWindow();
  return `${LESSONS_PATH}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=${NEXT_LESSONS_LIMIT}`;
}

export const NOTIFICATION_PREFS_PATH = '/me/notifications';

const USERS_PATH = '/users';
export const TEACHERS_PATH = `${USERS_PATH}/teachers`;
export const INVITE_LINK_PATH = `${USERS_PATH}/invite-link`;

export const MY_LESSONS_PATH = '/me/lessons';
export const MY_EXAMS_PATH = '/me/exams';

/** Путь одной записи коллекции — `hooks/useEntityEditor.ts` читает,
 * сохраняет и удаляет по нему; редакторы приносят свой `collectionPath`. */
export function entityPath(collectionPath: string, id: string): string {
  return `${collectionPath}/${id}`;
}
