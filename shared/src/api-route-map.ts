// Сборка карты маршрутов из записей доменов (ADR-0148). Новый домен — две
// строки: его `…Routes` в пересечение и `…_ROUTE_KEYS` в множество ключей.
// Форму записей и ключей проверяет api-routes.ts (CheckedRouteMap), полноту
// множества — `Record` ниже: забытый в нём домен не компилируется.
import { ANALYTICS_ROUTE_KEYS, type AnalyticsRoutes } from './analytics-routes';
import {
  ANSWER_VIDEOS_ROUTE_KEYS,
  type AnswerVideosRoutes,
} from './answer-videos-routes';
import { APP_ERRORS_ROUTE_KEYS, type AppErrorsRoutes } from './app-errors-routes';
import { CHANNELS_ROUTE_KEYS, type ChannelsRoutes } from './channels-routes';
import { CLASSES_ROUTE_KEYS, type ClassesRoutes } from './classes-routes';
import {
  EXAM_ATTEMPTS_ROUTE_KEYS,
  type ExamAttemptsRoutes,
} from './exam-attempts-routes';
import { EXAM_ITEMS_ROUTE_KEYS, type ExamItemsRoutes } from './exam-items-routes';
import { EXAMS_ROUTE_KEYS, type ExamsRoutes } from './exams-routes';
import { GRADING_ROUTE_KEYS, type GradingRoutes } from './grading-routes';
import { INBOX_ROUTE_KEYS, type InboxRoutes } from './inbox-routes';
import { LESSONS_ROUTE_KEYS, type LessonsRoutes } from './lessons-routes';
import { MATERIALS_ROUTE_KEYS, type MaterialsRoutes } from './materials-routes';
import {
  NOTIFICATIONS_ROUTE_KEYS,
  type NotificationsRoutes,
} from './notifications-routes';
import { PAYMENTS_ROUTE_KEYS, type PaymentsRoutes } from './payments-routes';
import { TAGS_ROUTE_KEYS, type TagsRoutes } from './tags-routes';
import { USERS_ROUTE_KEYS, type UsersRoutes } from './users-routes';

export type ApiRouteMap = AnalyticsRoutes &
  AnswerVideosRoutes &
  AppErrorsRoutes &
  ChannelsRoutes &
  ClassesRoutes &
  ExamAttemptsRoutes &
  ExamItemsRoutes &
  ExamsRoutes &
  GradingRoutes &
  InboxRoutes &
  LessonsRoutes &
  MaterialsRoutes &
  NotificationsRoutes &
  PaymentsRoutes &
  TagsRoutes &
  UsersRoutes;

export const API_ROUTE_KEY_SET: Record<keyof ApiRouteMap, true> = {
  ...ANALYTICS_ROUTE_KEYS,
  ...ANSWER_VIDEOS_ROUTE_KEYS,
  ...APP_ERRORS_ROUTE_KEYS,
  ...CHANNELS_ROUTE_KEYS,
  ...CLASSES_ROUTE_KEYS,
  ...EXAM_ATTEMPTS_ROUTE_KEYS,
  ...EXAM_ITEMS_ROUTE_KEYS,
  ...EXAMS_ROUTE_KEYS,
  ...GRADING_ROUTE_KEYS,
  ...INBOX_ROUTE_KEYS,
  ...LESSONS_ROUTE_KEYS,
  ...MATERIALS_ROUTE_KEYS,
  ...NOTIFICATIONS_ROUTE_KEYS,
  ...PAYMENTS_ROUTE_KEYS,
  ...TAGS_ROUTE_KEYS,
  ...USERS_ROUTE_KEYS,
};
