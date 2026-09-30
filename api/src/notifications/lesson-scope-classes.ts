// Занятия расписания для списка галочек «о каких занятиях напоминать»
// (ADR-0162). Ответ видит любой вошедший, включая ученика, поэтому маппер
// собирает DTO по полям явно: ссылка Zoom, пароль, каналы, теги (скрыты от
// ученика, ADR-0072) и ведущий уйти отсюда не могут, даже если их добавят в
// схему класса. Шифруемых полей среди читаемых нет (title, groupLabel, tz,
// rules — `plain`, class.schema.ts), расшифровка не нужна.
import type { Model, Types } from 'mongoose';
import { LIST_LIMIT_MAX, SCHOOL_TZ, type LessonScopeClassDto } from '@xuanxue/shared';
import type { ClassRecord } from '../classes/class.schema';

// Потолок списка — максимум API (CLAUDE.md «API»: «дай всё» запрещено).
// Занятий расписания в школе десятки; упереться в 200 — повод пересмотреть
// экран, а не отдавать больше.
const SCOPE_CLASSES_LIMIT = LIST_LIMIT_MAX;

/** Как класс приходит из `.lean()`: `groupLabel` и `tz` у документов старше
 * своих полей могут отсутствовать — default схемы при `.lean()` не
 * подставляется (тот же довод, что у LeanClass в class.mapper.ts). */
interface LeanScopeClass {
  _id: Types.ObjectId;
  title: string;
  groupLabel?: string;
  tz?: string;
  rules: { weekday: number; time: string; durationMin: number }[];
}

function toLessonScopeClassDto(doc: LeanScopeClass): LessonScopeClassDto {
  return {
    id: doc._id.toString(),
    title: doc.title,
    groupLabel: doc.groupLabel ?? '',
    tz: doc.tz ?? SCHOOL_TZ,
    // Поля правила перечислены явно: `_id` субдокумента — деталь хранения.
    slots: doc.rules.map((rule) => ({
      weekday: rule.weekday,
      time: rule.time,
      durationMin: rule.durationMin,
    })),
  };
}

/** Активные занятия по названию, затем по подписи группы, затем по id — порядок
 * на экране не прыгает между запросами. `collation: ru` — по алфавиту без учёта
 * регистра: без неё «Яблоко» встало бы выше «арбуза» (classes.service.ts). */
export async function listLessonScopeClasses(
  model: Model<ClassRecord>,
): Promise<LessonScopeClassDto[]> {
  const docs = await model
    .find({ active: true }, { title: 1, groupLabel: 1, tz: 1, rules: 1 })
    .collation({ locale: 'ru' })
    .sort({ title: 1, groupLabel: 1, _id: 1 })
    .limit(SCOPE_CLASSES_LIMIT)
    .lean<LeanScopeClass[]>();
  return docs.map(toLessonScopeClassDto);
}
