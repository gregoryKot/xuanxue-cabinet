// «О каких занятиях» (ADR-0162): фильтр, по которому человек получает отмены занятий,
// записи и новые материалы. «Занятие скоро» этот фильтр не читает: у напоминаний свой
// выбор (shared/src/reminder-sync.ts, ADR-0185). Отдельный файл, а не дописанный
// `notifications.ts`: тот стоит на границе храповика размера (150 строк).
import type { RuleEveryWeeks } from './domain';
import type { NotificationKind } from './notifications';

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
  /** `everyWeeks` — только чтобы подписать «раз в 2 недели» (ADR-0168); дата
   * первого занятия ученику не нужна и сюда не попадает. */
  slots: {
    weekday: number;
    time: string;
    durationMin: number;
    everyWeeks?: RuleEveryWeeks;
  }[];
}

export interface MyLessonNotificationsDto {
  scope: LessonScope;
  /** Выбирал ли человек сам: в `notification_prefs` записан режим, и «все» в
   * том числе. `false` — «все» по умолчанию. Отдельное поле, а не часть
   * `LessonScope`: этот тип же — тело `PUT`, а «выбирал» решает сервер, не клиент. */
  scopeChosen: boolean;
  /** Активные занятия расписания — из них человек ставит галочки. */
  classes: LessonScopeClassDto[];
}

export type UpdateLessonScopeInput = LessonScope;

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

/** Виды уведомлений, которые касаются занятия расписания: для человека с таким
 * видом экран настроек показывает выбор занятий и «за сколько напомнить». «Занятие
 * скоро» идёт по выбору напоминаний (ADR-0185), остальные — по фильтру «о каких
 * занятиях» (`isLessonInScope`). «Новый материал» здесь потому, что у материала свой
 * набор занятий (привязка и теги, ADR-0162): общий материал приходит всем,
 * привязанный — тем, чей фильтр его занятий касается. Вид без занятия (результат
 * экзамена, оплата) занятий не касается, и экрану нечего делать у человека, у
 * которого таких видов нет. */
export const LESSON_SCOPED_KINDS: readonly NotificationKind[] = [
  'lesson_soon',
  'lesson_cancelled',
  'recording_ready',
  'material_new',
];

/** Есть ли среди видов человека хоть один про занятие — тогда экран настроек
 * показывает выбор занятий для напоминаний (у штата видов про занятие нет, решение
 * владельца 2026-09-30, ADR-0162). */
export function hasLessonScopedKinds(kinds: readonly NotificationKind[]): boolean {
  return kinds.some((kind) => LESSON_SCOPED_KINDS.includes(kind));
}
