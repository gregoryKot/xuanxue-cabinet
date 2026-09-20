// Чистая логика формы занятия — состояние, валидация, сборка тела запроса
// (CLAUDE.md «Тесты»: логика без React), по образцу schedule/classFormInput.ts.
// durationMin хранится строкой — пустое поле не подменяется нулём молча
// (ревью п.10). Длительность делит границы с занятием расписания
// (CLASS_LIMITS.durationMin*) — то же понятие «сколько минут длится встреча»,
// отдельного лимита у LESSON_LIMITS для него нет. Теги даты (ADR-0059) —
// строкой через запятую (tagsText), тот же приём и тот же parseTagsText, что
// у schedule/classFormInput.ts — второго разбора строки не заводим.
import {
  CLASS_LIMITS,
  LESSON_DEFAULT_DURATION_MIN,
  parseTagsText,
  type ClassDto,
  type CreateLessonInput,
  type LessonDto,
  type UpdateLessonInput,
} from '@xuanxue/shared';
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '../lib/formatDate';
import { longTagError } from '../lib/longTagError';

export interface LessonFormState {
  classId: string;
  topic: string;
  /** Строкой, не массивом — набранная запятая иначе теряется при разборе на
   * каждое нажатие клавиши (та же причина, что у
   * materials/materialFormInput.ts). Поле показывается только при правке —
   * ADR-0059: тег ставят после занятия, у разового занятия при создании
   * разбирать ещё нечего (toCreateInput его не отправляет). */
  tagsText: string;
  startsAtLocal: string;
  durationMinText: string;
  zoomLinkOverride: string;
  zoomPasswordOverride: string;
  note: string;
  /** id учителя из GET /users/teachers, пустая строка — «не указан»
   * (LeaderField, аудит В4). Только правка — при создании разового занятия
   * ведущего не выбирают (CreateLessonInput его не принимает: без
   * назначения он наследуется от класса расписания). */
  leaderId: string;
}

export function initialLessonFormState(
  lessonDto: LessonDto | null,
  classes: ClassDto[],
): LessonFormState {
  return {
    classId: lessonDto?.classId ?? classes[0]?.id ?? '',
    topic: lessonDto?.topic ?? '',
    tagsText: lessonDto?.tags.join(', ') ?? '',
    startsAtLocal: lessonDto ? toDatetimeLocalValue(lessonDto.startsAt) : '',
    durationMinText: String(lessonDto?.durationMin ?? LESSON_DEFAULT_DURATION_MIN),
    zoomLinkOverride: lessonDto?.zoomLinkOverride ?? '',
    zoomPasswordOverride: lessonDto?.zoomPasswordOverride ?? '',
    note: lessonDto?.note ?? '',
    leaderId: lessonDto?.leaderId ?? '',
  };
}

function isValidInt(text: string, min: number, max: number): boolean {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value >= min && value <= max;
}

/** `null` — форма валидна, иначе текст первой найденной ошибки. Остальное
 * (длина темы/заметки, формат ссылки) — за сервером, показывается через
 * `details` (docs/PLAN.md §6, как у формы занятия расписания). */
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
  // Почему длину тега проверяем на клиенте — шапка lib/longTagError.ts, тот
  // же приём, что у classFormInput.ts.
  return longTagError(state.tagsText);
}

export function toCreateInput(state: LessonFormState): CreateLessonInput {
  // Тегов нет и здесь: поле формы показывается только при правке — ADR-0059,
  // тег ставят после занятия, у разового занятия в момент создания
  // разбирать ещё нечего.
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
    // Пустой вариант «— не указан —» — явный сброс (null, leaderId входит в
    // NULLABLE_LESSON_FIELDS), не «оставить как было» (ревью п.8).
    leaderId: state.leaderId || null,
    // Пустая строка даёт [] — это и есть сброс тегов: поля нет в
    // NULLABLE_LESSON_FIELDS, null сервер не примет (shared/src/lessons.ts).
    tags: parseTagsText(state.tagsText),
  };
}
