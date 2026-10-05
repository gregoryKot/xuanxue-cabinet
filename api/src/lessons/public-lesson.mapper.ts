// Маппер LessonRecord + ClassRecord (lean, уже расшифрованные) →
// PublicLessonDto (`/public/lessons`, ADR-0170). Явный allowlist полей, не
// «объект целиком минус секреты»: маршрут открыт всему интернету, а новое
// поле в схеме класса или занятия иначе утекло бы само (CLAUDE.md, «API»).
// Zoom-ссылок и паролей здесь нет ни у класса, ни у занятия — входной тип
// их даже не объявляет, а spec проверяет точный набор ключей.
import type { Types } from 'mongoose';
import type { PublicLessonDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { LeanLesson } from './lesson.mapper';
import type { LessonClassLookupInput } from './lesson-classes.lookup';

export function toPublicLessonDto(
  lesson: Pick<
    LeanLesson,
    '_id' | 'startsAt' | 'durationMin' | 'topic' | 'status' | 'tags'
  > & { classId: Types.ObjectId },
  cls: Pick<LessonClassLookupInput, 'title' | 'groupLabel' | 'format' | 'location'>,
): PublicLessonDto {
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
    // У дат до ADR-0075 поля `tags` в документе нет — контракт требует `[]`.
    tags: lesson.tags ?? [],
  };
  // Ключ `location` — только если адрес есть (контракт: «omitted when absent»).
  // Пустая строка — не «нет адреса»: контракт велит отдавать пустые строки как
  // есть, поэтому проверка на undefined, а не на truthy.
  if (cls.location !== undefined) dto.location = cls.location;
  return dto;
}
