// Проекция LessonRecord + ClassRecord (lean) → PublicLessonDto
// (`/public/lessons`, ADR-0170). Явный allowlist полей, не «объект целиком
// минус секреты»: маршрут открыт всему интернету, а новое поле в схеме класса
// или занятия иначе утекло бы само (CLAUDE.md, «API»). Zoom-ссылок и паролей
// здесь нет ни у класса, ни у занятия — входной тип их даже не объявляет, а
// spec проверяет точный набор ключей.
//
// Битая строка — не исключение, а причина: контракт Workshop (public-lessons.md,
// случай 6) велит выбросить такое занятие из ответа и записать error-лог, а
// остальные отдать. lean() не подставляет default и не проверяет enum, поэтому
// значения из базы здесь — `unknown`, пока не проверены.
import { Types } from 'mongoose';
import {
  CLASS_FORMATS,
  LESSON_STATUSES,
  type ClassFormat,
  type LessonStatus,
  type PublicLessonDto,
} from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { LeanLesson } from './lesson.mapper';
import type { LessonClassLookupInput } from './lesson-classes.lookup';

type PublicLessonInput = Pick<
  LeanLesson,
  '_id' | 'startsAt' | 'durationMin' | 'topic' | 'status' | 'tags'
> & { classId: Types.ObjectId };

type PublicClassInput = Pick<
  LessonClassLookupInput,
  'title' | 'groupLabel' | 'format' | 'location'
>;

export type PublicLessonProjection = { dto: PublicLessonDto } | { reason: string };

/** Строка ObjectId или `undefined`, если в поле не ObjectId (битый документ). */
export function objectIdString(value: unknown): string | undefined {
  return value instanceof Types.ObjectId ? value.toString() : undefined;
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function invalidReason(
  lesson: PublicLessonInput,
  cls: PublicClassInput,
): string | undefined {
  const startsAt: unknown = lesson.startsAt;
  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
    return 'startsAt не дата';
  }
  const duration: unknown = lesson.durationMin;
  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    return 'durationMin не конечное число';
  }
  const strings: [string, unknown][] = [
    ['topic', lesson.topic],
    ['classTitle', cls.title],
    ['groupLabel', cls.groupLabel],
  ];
  for (const [field, value] of strings) {
    if (typeof value !== 'string') return `${field} не строка`;
  }
  if (!isOneOf<ClassFormat>(CLASS_FORMATS, cls.format)) {
    return 'format вне online/offline/both';
  }
  if (!isOneOf<LessonStatus>(LESSON_STATUSES, lesson.status)) {
    return 'status вне scheduled/cancelled';
  }
  // У дат до ADR-0075 поля `tags` в документе нет — это законно, контракт
  // требует `[]`. Битым считается только присутствующее не-массив-строк.
  const tags: unknown = lesson.tags;
  if (
    tags !== undefined &&
    (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string'))
  ) {
    return 'tags не массив строк';
  }
  const location: unknown = cls.location;
  if (location !== undefined && typeof location !== 'string') {
    return 'location не строка';
  }
  return undefined;
}

export function projectPublicLesson(
  lesson: PublicLessonInput,
  cls: PublicClassInput | undefined,
): PublicLessonProjection {
  if (objectIdString(lesson._id) === undefined) return { reason: '_id не ObjectId' };
  if (objectIdString(lesson.classId) === undefined) {
    return { reason: 'classId не ObjectId' };
  }
  if (!cls) return { reason: 'класс не найден' };
  const reason = invalidReason(lesson, cls);
  if (reason !== undefined) return { reason };
  const dto: PublicLessonDto = {
    id: lesson._id.toString(),
    classId: lesson.classId.toString(),
    startsAt: toIsoUtc(lesson.startsAt),
    durationMin: lesson.durationMin,
    classTitle: cls.title,
    groupLabel: cls.groupLabel,
    format: cls.format,
    topic: lesson.topic,
    status: lesson.status,
    tags: lesson.tags ?? [],
  };
  // Ключ `location` — только если адрес есть (контракт: «omitted when absent»).
  // Пустая строка — не «нет адреса»: контракт велит отдавать пустые строки как
  // есть, поэтому проверка на undefined, а не на truthy.
  if (cls.location !== undefined) dto.location = cls.location;
  return { dto };
}
