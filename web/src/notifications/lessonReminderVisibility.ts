// Кому нужны настройки напоминаний о занятиях и когда ленте пора о них напомнить
// (ADR-0185). Чистая логика без React и сети: оба решения принимают данные,
// которые экран уже получил.
import {
  availableNotifications,
  hasLessonScopedKinds,
  type MeDto,
  type NotificationKind,
  type ReminderSyncSnapshot,
} from '@xuanxue/shared';

/** Есть ли человеку что настраивать про занятия: хоть один вид уведомления
 * про занятие (`hasLessonScopedKinds`). Сегодня это ученик; штат получает
 * обо всех занятиях, решение владельца 2026-09-30. Человеку без видов про
 * занятие запросы за снимком и за занятиями школы не нужны: сервер отдал бы
 * список впустую. */
export function hasLessonSettings(me: MeDto | null): boolean {
  return me !== null && hasLessonScopedKinds(availableNotifications(me.roles));
}

const REMINDER_KIND: NotificationKind = 'lesson_soon';

interface HintInput {
  /** Виды, доступные человеку по ролям. */
  kinds: readonly NotificationKind[];
  /** Включённые виды; `null`, пока ответа нет. */
  enabled: readonly NotificationKind[] | null;
  /** Снимок напоминаний; `null`, пока ответа нет или он не разобрался. */
  snapshot: ReminderSyncSnapshot | null;
}

/** Лента зовёт отметить занятия, когда напоминания включены, а отмечено ничего:
 * пока нет ни занятия расписания, ни отдельного занятия, ничего не придёт.
 * Без занятий в расписании школы отмечать нечего — карточка была бы тупиком.
 * Нет данных — не показываем: «пока не знаем» не повод тревожить. */
export function isReminderHintDue({ kinds, enabled, snapshot }: HintInput): boolean {
  if (enabled === null || snapshot === null) return false;
  if (!kinds.includes(REMINDER_KIND) || !enabled.includes(REMINDER_KIND)) return false;
  const hasChoice = snapshot.classIds.length > 0 || snapshot.lessonIds.length > 0;
  return !hasChoice && snapshot.classes.length > 0;
}
