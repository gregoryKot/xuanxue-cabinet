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
import { AUTH_ROUTE_KEYS, type AuthRoutes } from './auth-routes';
import { BOARD_ROUTE_KEYS, type BoardRoutes } from './board-routes';
import { BROADCASTS_ROUTE_KEYS, type BroadcastsRoutes } from './broadcasts-routes';
import { CHANNELS_ROUTE_KEYS, type ChannelsRoutes } from './channels-routes';
import { CLASSES_ROUTE_KEYS, type ClassesRoutes } from './classes-routes';
import {
  EXAM_ATTEMPTS_ROUTE_KEYS,
  type ExamAttemptsRoutes,
} from './exam-attempts-routes';
import { EXAM_IMAGES_ROUTE_KEYS, type ExamImagesRoutes } from './exam-images-routes';
import { EXAM_ITEMS_ROUTE_KEYS, type ExamItemsRoutes } from './exam-items-routes';
import { EXAM_VIDEOS_ROUTE_KEYS, type ExamVideosRoutes } from './exam-videos-routes';
import { EXAMS_ROUTE_KEYS, type ExamsRoutes } from './exams-routes';
import { GRADING_ROUTE_KEYS, type GradingRoutes } from './grading-routes';
import { INBOX_ROUTE_KEYS, type InboxRoutes } from './inbox-routes';
import {
  LESSON_VIDEOS_ROUTE_KEYS,
  type LessonVideosRoutes,
} from './lesson-videos-routes';
import { LESSONS_ROUTE_KEYS, type LessonsRoutes } from './lessons-routes';
import { MATERIALS_ROUTE_KEYS, type MaterialsRoutes } from './materials-routes';
import { ME_ROUTE_KEYS, type MeRoutes } from './me-routes';
import { MY_EXAMS_ROUTE_KEYS, type MyExamsRoutes } from './my-exams-routes';
import { MY_LESSONS_ROUTE_KEYS, type MyLessonsRoutes } from './my-lessons-routes';
import {
  NOTIFICATIONS_ROUTE_KEYS,
  type NotificationsRoutes,
} from './notifications-routes';
import { PAYMENTS_ROUTE_KEYS, type PaymentsRoutes } from './payments-routes';
import {
  PUBLIC_LESSONS_ROUTE_KEYS,
  type PublicLessonsRoutes,
} from './public-lessons-routes';
import {
  SCHOOL_EVENTS_ROUTE_KEYS,
  type SchoolEventsRoutes,
} from './school-events-routes';
import { SETTINGS_ROUTE_KEYS, type SettingsRoutes } from './settings-routes';
import { TAGS_ROUTE_KEYS, type TagsRoutes } from './tags-routes';
import { USERS_ROUTE_KEYS, type UsersRoutes } from './users-routes';

export type ApiRouteMap = AnalyticsRoutes &
  AnswerVideosRoutes &
  AppErrorsRoutes &
  AuthRoutes &
  BoardRoutes &
  BroadcastsRoutes &
  ChannelsRoutes &
  ClassesRoutes &
  ExamAttemptsRoutes &
  ExamImagesRoutes &
  ExamItemsRoutes &
  ExamVideosRoutes &
  ExamsRoutes &
  GradingRoutes &
  InboxRoutes &
  LessonVideosRoutes &
  LessonsRoutes &
  MaterialsRoutes &
  MeRoutes &
  MyExamsRoutes &
  MyLessonsRoutes &
  NotificationsRoutes &
  PaymentsRoutes &
  PublicLessonsRoutes &
  SchoolEventsRoutes &
  SettingsRoutes &
  TagsRoutes &
  UsersRoutes;

export const API_ROUTE_KEY_SET: Record<keyof ApiRouteMap, true> = {
  ...ANALYTICS_ROUTE_KEYS,
  ...ANSWER_VIDEOS_ROUTE_KEYS,
  ...APP_ERRORS_ROUTE_KEYS,
  ...AUTH_ROUTE_KEYS,
  ...BOARD_ROUTE_KEYS,
  ...BROADCASTS_ROUTE_KEYS,
  ...CHANNELS_ROUTE_KEYS,
  ...CLASSES_ROUTE_KEYS,
  ...EXAM_ATTEMPTS_ROUTE_KEYS,
  ...EXAM_IMAGES_ROUTE_KEYS,
  ...EXAM_ITEMS_ROUTE_KEYS,
  ...EXAM_VIDEOS_ROUTE_KEYS,
  ...EXAMS_ROUTE_KEYS,
  ...GRADING_ROUTE_KEYS,
  ...INBOX_ROUTE_KEYS,
  ...LESSON_VIDEOS_ROUTE_KEYS,
  ...LESSONS_ROUTE_KEYS,
  ...MATERIALS_ROUTE_KEYS,
  ...ME_ROUTE_KEYS,
  ...MY_EXAMS_ROUTE_KEYS,
  ...MY_LESSONS_ROUTE_KEYS,
  ...NOTIFICATIONS_ROUTE_KEYS,
  ...PAYMENTS_ROUTE_KEYS,
  ...PUBLIC_LESSONS_ROUTE_KEYS,
  ...SCHOOL_EVENTS_ROUTE_KEYS,
  ...SETTINGS_ROUTE_KEYS,
  ...TAGS_ROUTE_KEYS,
  ...USERS_ROUTE_KEYS,
};
