// Чистая логика листа занятия — состояние, валидация, сборка тела запроса
// (CLAUDE.md «Тесты»: логика без React), по образцу schedule/classFormInput.ts.
// durationMin хранится строкой — пустое поле не подменяется нулём молча
// (ревью п.10). Длительность делит границы с занятием расписания
// (CLASS_LIMITS.durationMin*) — то же понятие «сколько минут длится встреча»,
// отдельного лимита у LESSON_LIMITS для него нет.
import {
  CLASS_LIMITS,
  LESSON_DEFAULT_DURATION_MIN,
  type ClassDto,
  type CreateLessonInput,
  type LessonDto,
  type UpdateLessonInput,
} from '@xuanxue/shared';
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '../lib/formatDate';

export interface LessonFormState {
  classId: string;
  topic: string;
  startsAtLocal: string;
  durationMinText: string;
  zoomLinkOverride: string;
  zoomPasswordOverride: string;
  note: string;
}

export function initialLessonFormState(
  lessonDto: LessonDto | null,
  classes: ClassDto[],
): LessonFormState {
  return {
    classId: lessonDto?.classId ?? classes[0]?.id ?? '',
    topic: lessonDto?.topic ?? '',
    startsAtLocal: lessonDto ? toDatetimeLocalValue(lessonDto.startsAt) : '',
    durationMinText: String(lessonDto?.durationMin ?? LESSON_DEFAULT_DURATION_MIN),
    zoomLinkOverride: lessonDto?.zoomLinkOverride ?? '',
    zoomPasswordOverride: lessonDto?.zoomPasswordOverride ?? '',
    note: lessonDto?.note ?? '',
  };
}

function isValidInt(text: string, min: number, max: number): boolean {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value >= min && value <= max;
}

/** `null` — форма валидна, иначе текст первой найденной ошибки. Остальное
 * (длина темы/заметки, формат ссылки) — за сервером, показывается через
 * `details` (docs/PLAN.md §6, как у ClassSheet). */
export function validateLessonForm(
  state: LessonFormState,
  isCreate: boolean,
): string | null {
  if (isCreate && !state.classId) return 'Выберите занятие расписания.';
  if (!state.startsAtLocal) return 'Укажите дату и время начала.';
  if (fromDatetimeLocalValue(state.startsAtLocal) === null) {
    return 'Дата и время начала указаны неверно.';
  }
  if (
    !isValidInt(
      state.durationMinText,
      CLASS_LIMITS.durationMinMin,
      CLASS_LIMITS.durationMinMax,
    )
  ) {
    return `Длительность — целое число от ${CLASS_LIMITS.durationMinMin} до ${CLASS_LIMITS.durationMinMax} минут.`;
  }
  return null;
}

export function toCreateInput(state: LessonFormState): CreateLessonInput {
  return {
    classId: state.classId,
    startsAt: fromDatetimeLocalValue(state.startsAtLocal) ?? '',
    durationMin: Number(state.durationMinText),
    topic: state.topic.trim() || undefined,
  };
}

export function toUpdateInput(state: LessonFormState): UpdateLessonInput {
  return {
    topic: state.topic.trim(),
    startsAt: fromDatetimeLocalValue(state.startsAtLocal) ?? '',
    durationMin: Number(state.durationMinText),
    zoomLinkOverride: state.zoomLinkOverride.trim() || null,
    zoomPasswordOverride: state.zoomPasswordOverride.trim() || null,
    note: state.note.trim() || null,
  };
}
