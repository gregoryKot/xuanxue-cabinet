// Маппер LessonRecord + ClassRecord (lean, уже расшифрованные) →
// PublicLessonDto (`/public/lessons`, ADR-0170). Явный allowlist полей, не
// «объект целиком минус секреты»: маршрут открыт всему интернету, а новое
// поле в схеме класса или занятия иначе утекло бы само (CLAUDE.md, «API»).
// Zoom-ссылок и паролей здесь нет ни у класса, ни у занятия — входной тип
// их даже не объявляет, а spec проверяет точный набор ключей.
import type { Types } from 'mongoose';
import { CLASS_FORMATS, LESSON_STATUSES, type PublicLessonDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { LeanLesson } from './lesson.mapper';
import type { LessonClassLookupInput } from './lesson-classes.lookup';

// lean() не подставляет default схемы, а JSON.stringify выкидывает undefined
// и пишет NaN/Infinity как null. Контракт Workshop (public-lessons.md, случай 6):
// битое обязательное поле роняет весь ответ, а не пропадает из массива.
// Пустая строка законна; нет `location` — ключа нет; нет `tags` маппер уже
// заменил на `[]` до вызова. Текст — в лог, клиенту фильтр отдаёт общий
// internal_error.
function assertPublicLessonContract(dto: PublicLessonDto): void {
  const strings: Record<string, unknown> = {
    id: dto.id,
    classId: dto.classId,
    startsAt: dto.startsAt,
    classTitle: dto.classTitle,
    groupLabel: dto.groupLabel,
    topic: dto.topic,
  };
  for (const [field, value] of Object.entries(strings)) {
    if (typeof value !== 'string') {
      throw new Error(`Публичное занятие: поле ${field} не строка`);
    }
  }
  if (dto.id === '' || dto.classId === '' || dto.startsAt === '') {
    throw new Error('Публичное занятие: пустой id, classId или startsAt');
  }
  if (typeof dto.durationMin !== 'number' || !Number.isFinite(dto.durationMin)) {
    throw new Error(
      `Публичное занятие: durationMin «${String(dto.durationMin)}» не конечное число`,
    );
  }
  if (!CLASS_FORMATS.includes(dto.format)) {
    throw new Error(
      `Публичное занятие: format «${String(dto.format)}» вне online/offline/both`,
    );
  }
  if (!LESSON_STATUSES.includes(dto.status)) {
    throw new Error(
      `Публичное занятие: status «${String(dto.status)}» вне scheduled/cancelled`,
    );
  }
  if (!Array.isArray(dto.tags) || dto.tags.some((tag) => typeof tag !== 'string')) {
    throw new Error('Публичное занятие: tags не массив строк');
  }
  if ('location' in dto && typeof dto.location !== 'string') {
    throw new Error('Публичное занятие: location не строка');
  }
}

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
  assertPublicLessonContract(dto);
  return dto;
}
