// Маппер LessonRecord + ClassRecord (lean, уже расшифрованные) → MyLessonDto
// (`/me/lessons`, ТЗ docs/PLAN.md §11). Чистая функция без Mongo и DI — эффективная
// ссылка/пароль Zoom считаются тем же правилом, что и в посте занятия
// (broadcasts/post-renderer.ts: override занятия важнее ссылки класса, пароль
// разовой ссылки не наследуется от пароля класса) — здесь отдельная копия
// правила, не импорт из broadcasts: там оно завязано на шаблон рассылки,
// здесь — на прямой ответ API, разные форматы результата у одной и той же
// формулы дешевле держать явно, чем плести модуль рассылок в ответ ученику.
import type { Types } from 'mongoose';
import type { ClassFormat, LessonStatus, MyLessonDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';

export interface MyLessonClassInput {
  title: string;
  groupLabel: string;
  format: ClassFormat;
  location?: string;
  zoomLink?: string;
  zoomPassword?: string;
}

export interface MyLessonInput {
  _id: Types.ObjectId;
  startsAt: Date;
  durationMin: number;
  topic: string;
  status: LessonStatus;
  zoomLinkOverride?: string;
  zoomPasswordOverride?: string;
}

export function toMyLessonDto(
  lesson: MyLessonInput,
  cls: MyLessonClassInput,
): MyLessonDto {
  return {
    id: lesson._id.toString(),
    startsAt: toIsoUtc(lesson.startsAt),
    durationMin: lesson.durationMin,
    classTitle: cls.title,
    groupLabel: cls.groupLabel,
    format: cls.format,
    location: cls.location,
    zoomLink: lesson.zoomLinkOverride ?? cls.zoomLink,
    // Пароль разовой ссылки не наследуется от пароля класса (правило
    // post-renderer.ts, docs/PLAN.md §6): новая ссылка со старым паролем
    // ученику была бы неправдой.
    zoomPassword: lesson.zoomLinkOverride
      ? lesson.zoomPasswordOverride
      : cls.zoomPassword,
    topic: lesson.topic,
    status: lesson.status,
  };
}
