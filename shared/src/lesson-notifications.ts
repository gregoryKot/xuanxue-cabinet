// «О каких занятиях напоминать» (ADR-0162): человек сам выбирает занятия
// расписания, о которых получает уведомления. Отдельный файл, а не дописанный
// `notifications.ts`: тот стоит на границе храповика размера (150 строк).

/** `all` — обо всех занятиях школы, как было до ADR-0162 (дефолт: ученик ничего
 * не выбирал). `selected` — только о занятиях из `classIds`. */
export const LESSON_SCOPE_MODES = ['all', 'selected'] as const;
export type LessonScopeMode = (typeof LESSON_SCOPE_MODES)[number];

// Потолок списка галочек: «дай всё» запрещено CLAUDE.md «API», а в школе
// занятий расписания десятки, не сотни. Тело PUT с тысячей id — уже не выбор
// человека, а попытка раздуть документ настроек.
export const LESSON_SCOPE_CLASS_IDS_MAX = 50;

export interface LessonScope {
  mode: LessonScopeMode;
  /** id занятий расписания (`classes`). Режим `all` список не стирает: вернулся
   * к `selected` — галочки на месте. */
  classIds: string[];
}

/** Занятие расписания глазами ученика — только то, что нужно для подписи в
 * списке галочек. Ссылки Zoom, пароли, каналы, минуты до анонса, теги (скрыты
 * от ученика, ADR-0072) и ведущий сюда не попадают никогда: ответ отдаётся
 * любому вошедшему, включая ученика (SECURITY). */
export interface LessonScopeClassDto {
  id: string;
  title: string;
  groupLabel: string;
  tz: string;
  slots: { weekday: number; time: string; durationMin: number }[];
}

// «За сколько напомнить» (ADR-0162, п. 3): короткий список вместо свободного
// числа — это выбор из четырёх пунктов, а не поле, в которое надо думать.
// Покрывает путь от «успеть подключиться» (15) до «успеть доехать» (120).
export const LESSON_REMINDER_CHOICES = [15, 30, 60, 120] as const;

export interface LessonReminderDto {
  /** Свой выбор человека, минуты до начала. `null` — «как в школе». */
  minutes: number | null;
  /** Школьное значение (`settings.lessonReminderMinutes`): экран подписывает
   * им пункт «как в школе» и не ходит за настройками школы отдельно. */
  schoolMinutes: number;
}

export interface MyLessonNotificationsDto {
  scope: LessonScope;
  /** Активные занятия расписания — из них человек ставит галочки. */
  classes: LessonScopeClassDto[];
  reminder: LessonReminderDto;
}

export type UpdateLessonScopeInput = LessonScope;

/** `null` — снять свой выбор, вернуться к «как в школе». */
export interface UpdateLessonReminderInput {
  minutes: number | null;
}

/** За сколько минут до занятия напоминать человеку: его выбор, а если он не
 * выбирал — значение школы. Единственное место, где это решается: тик и
 * экран не должны разойтись в ответе на «когда придёт». */
export function effectiveReminderMinutes(
  own: number | null | undefined,
  school: number,
): number {
  return own ?? school;
}

/** Касается ли выбор человека этого занятия. «Выбранные» без единой галочки —
 * честное «ни о каких» (ADR-0162): пустой список не превращается в «все». */
export function isLessonInScope(scope: LessonScope, classId: string): boolean {
  return scope.mode === 'all' || scope.classIds.includes(classId);
}
