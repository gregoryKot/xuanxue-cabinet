// Подготовка тела создаваемой даты занятия — чистая логика, юнит-тест без
// Mongo (CLAUDE.md «Тесты»); класс и его правила сервис уже прочитал из базы.
import type { CreateLessonInput } from '@xuanxue/shared';
import { LESSON_DEFAULT_DURATION_MIN, normalizeTags } from '@xuanxue/shared';
import { parseUtcIso } from './lesson-dates';

export interface LessonCreatePayload {
  classId: string;
  startsAt: Date;
  durationMin: number;
  topic: string;
  tags: string[];
}

/** durationMin — из тела запроса, иначе первое правило класса, иначе общий
 * дефолт: у разовой даты занятия своего правила расписания нет, а класс
 * может быть создан вовсе без правил (только офлайн-адрес, например). */
export function buildCreatePayload(
  input: CreateLessonInput,
  classRules: readonly { durationMin: number }[],
): LessonCreatePayload {
  return {
    classId: input.classId,
    startsAt: parseUtcIso(input.startsAt, 'startsAt').toJSDate(),
    durationMin:
      input.durationMin ?? classRules[0]?.durationMin ?? LESSON_DEFAULT_DURATION_MIN,
    topic: input.topic ?? '',
    // Нормализация здесь, не в DTO: тег — фильтр (ADR-0059), опечатка и дубль
    // в базе разъехались бы с фильтром `tag` при чтении (тот же приём, что у
    // MaterialsService.create).
    tags: normalizeTags(input.tags ?? []),
  };
}
