// Тело PUT /me/notifications/lessons/scope (ADR-0162): режим и список занятий
// целиком. userId в теле нет: владелец — сессия (SECURITY §3), `whitelist`
// отбросил бы чужое поле, а `forbidNonWhitelisted` ответит 400. Что занятия
// существуют, проверяет LessonNotificationsService: DTO видит форму id, но не
// базу. Повторы id сервис схлопывает сам, здесь они не ошибка.
import { ArrayMaxSize, IsArray, IsIn, IsMongoId } from 'class-validator';
import {
  LESSON_SCOPE_CLASS_IDS_MAX,
  LESSON_SCOPE_MODES,
  type ApiRouteBody,
  type LessonScopeMode,
} from '@xuanxue/shared';

export class UpdateLessonScopeDto implements ApiRouteBody<'PUT /me/notifications/lessons/scope'> {
  @IsIn(LESSON_SCOPE_MODES)
  mode!: LessonScopeMode;

  @IsArray()
  @ArrayMaxSize(LESSON_SCOPE_CLASS_IDS_MAX)
  @IsMongoId({ each: true })
  classIds!: string[];
}
