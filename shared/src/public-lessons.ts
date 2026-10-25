// Публичное расписание школы для daychi (`GET /api/public/lessons`, ADR-0170).
// Контракт Workshop, ревизия 4aec5f84130c2dd8df6875c30fd94c3cf2a5ec74:
// https://github.com/dveyarangi/xuanxue-workshop/blob/4aec5f84130c2dd8df6875c30fd94c3cf2a5ec74/docs/contracts/public-lessons.md
// Ровно проекция контракта, без Zoom и служебных полей: маршрут открыт всему
// интернету, поэтому лишнее поле здесь — утечка (маппер в api — allowlist).
import type { ClassFormat, LessonStatus } from './domain';

export interface PublicLessonDto {
  id: string;
  classId: string;
  startsAt: string; // ISO UTC с Z
  durationMin: number;
  classTitle: string;
  groupLabel: string;
  format: ClassFormat;
  /** Нет адреса у класса — ключа в ответе нет (контракт: единственное необязательное поле). */
  location?: string;
  topic: string;
  status: LessonStatus;
  tags: string[];
}

/** Два режима, смешивать нельзя: `limit` (ближайшие) либо оба `from`+`to`
 * (полное окно) — правило проверяет `resolvePublicLessonsWindow` в api. */
export interface ListPublicLessonsQuery {
  limit?: number;
  from?: string;
  to?: string;
}

// Пределы взяты из контракта Workshop (ссылка в шапке файла), а не придуманы
// здесь: daychi рассчитывает на них, менять в одностороннем порядке нельзя.
export const PUBLIC_LESSONS_LIMIT_DEFAULT = 10;
export const PUBLIC_LESSONS_LIMIT_MAX = 50;
/** Окно не шире 4 недель = 28 суток UTC; ровно 28 суток допустимо. */
export const PUBLIC_LESSONS_WINDOW_MAX_WEEKS = 4;
