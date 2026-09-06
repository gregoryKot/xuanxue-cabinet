// Согласование занятий класса с ожидаемыми по правилам расписания — решения
// (удалить/перенести/вставить); Mongo-запросы — lesson-planner.queries.ts.
import { DateTime } from 'luxon';
import type { Types } from 'mongoose';
import type { LeanScheduleRule } from '../classes/class.schema';
import {
  expectedOccurrences,
  occurrenceAtSameLocalDate,
  type ExpectedOccurrence,
} from './lesson-occurrences';
import { isLessonTouched, type LessonLean } from './lesson-touched';

interface ReconcilePlan {
  toDelete: Types.ObjectId[];
  toMove: Array<{ id: Types.ObjectId; plannedAt: DateTime; durationMin: number }>;
  toInsert: ExpectedOccurrence[];
}

// «Слот планировщика», не «занятие тронуто целиком»: тему и ведущего
// учитель мог вписать заранее — перенос блокируют только ручной перенос
// (startsAt≠plannedAt), отмена и запись.
function isRelocatable(lesson: LessonLean): boolean {
  return (
    lesson.startsAt.getTime() === lesson.plannedAt.getTime() &&
    lesson.status === 'scheduled' &&
    lesson.recordings.length === 0
  );
}

// Кандидат допустим ТОЛЬКО если он — реально ожидаемый момент ТОГО ЖЕ
// правила и место ещё не занято другим занятием класса в этом тике. Без
// первого условия смена дня недели у правила считалась бы переносом
// (occurrenceAtSameLocalDate меняет только час/минуту, старый день
// остаётся). Без второго — обмен временем между двумя правилами одним
// сохранением ронял бы уникальный индекс на `updateOne`. Отказ обрабатывается
// как «правила больше нет»: нетронутое удаляется, тронутое остаётся;
// коллизия рассасывается за следующий тик (сервис вдобавок ловит E11000 на
// `updateOne` — гонка внутри тика возможна и после этой проверки).
function findRelocation(
  lesson: LessonLean,
  rule: LeanScheduleRule | undefined,
  tz: string,
  expected: ReadonlyMap<number, ExpectedOccurrence>,
  covered: ReadonlySet<number>,
): { plannedAt: DateTime; durationMin: number } | undefined {
  if (rule === undefined || !isRelocatable(lesson)) return undefined;
  const reference = DateTime.fromJSDate(lesson.plannedAt, { zone: 'utc' });
  const candidate = occurrenceAtSameLocalDate(rule, tz, reference);
  const candidateMs = candidate.toMillis();
  const target = expected.get(candidateMs);
  if (target === undefined) return undefined;
  if (!target.ruleId.equals(rule._id)) return undefined;
  if (covered.has(candidateMs)) return undefined;
  return { plannedAt: candidate, durationMin: target.durationMin };
}

/**
 * Согласование текущих занятий класса (`existing`, все со `plannedAt`) с
 * ожидаемыми по правилам на `[from, to)`. `leadBoundaryMs` — занятие с
 * `startsAt` не позже границы не трогаем: ссылка уже могла уйти. Дальше:
 * `plannedAt` совпал с ожидаемым — сменилась только длительность правила →
 * обновить на месте, иначе ничего не делать; найден допустимый перенос
 * (`findRelocation`) — тема/заметка/override остаются (сервис `$set`-ит
 * только `plannedAt`/`startsAt`/`durationMin`); иначе нетронутое удаляется
 * (правила больше нет, день недели сменился, время ушло за горизонт),
 * тронутое остаётся как есть. `toInsert` — ожидаемые моменты вне `existing`
 * и не покрытые переносом.
 */
export function reconcileClass(
  existing: readonly LessonLean[],
  rules: readonly LeanScheduleRule[],
  tz: string,
  leadBoundaryMs: number,
  from: DateTime,
  to: DateTime,
): ReconcilePlan {
  const expected = expectedOccurrences(rules, tz, from, to);
  const rulesById = new Map(rules.map((rule) => [rule._id.toString(), rule]));
  const covered = new Set(existing.map((lesson) => lesson.plannedAt.getTime()));

  const toDelete: Types.ObjectId[] = [];
  const toMove: ReconcilePlan['toMove'] = [];
  for (const lesson of existing) {
    if (lesson.startsAt.getTime() <= leadBoundaryMs) continue;

    const already = expected.get(lesson.plannedAt.getTime());
    if (already !== undefined) {
      const { plannedAt, durationMin } = already;
      if (durationMin !== lesson.durationMin && isRelocatable(lesson)) {
        toMove.push({ id: lesson._id, plannedAt, durationMin });
      }
      continue;
    }

    const rule = lesson.ruleId ? rulesById.get(lesson.ruleId.toString()) : undefined;
    const relocation = findRelocation(lesson, rule, tz, expected, covered);
    if (relocation !== undefined) {
      toMove.push({ id: lesson._id, ...relocation });
      covered.add(relocation.plannedAt.toMillis());
      continue;
    }
    if (isLessonTouched(lesson)) continue;
    toDelete.push(lesson._id);
  }

  const toInsert = [...expected.entries()]
    .filter(([plannedAtMs]) => !covered.has(plannedAtMs))
    .map(([, occurrence]) => occurrence);

  return { toDelete, toMove, toInsert };
}

/** Класс выключен — будущие занятия из расписания, кроме тронутых, убираются. */
export function untouchedLessonIds(
  lessons: readonly LessonLean[],
  leadBoundaryMs: number,
): Types.ObjectId[] {
  return lessons
    .filter((lesson) => lesson.startsAt.getTime() > leadBoundaryMs)
    .filter((lesson) => !isLessonTouched(lesson))
    .map((lesson) => lesson._id);
}

interface NewLessonDoc {
  classId: Types.ObjectId;
  plannedAt: Date;
  startsAt: Date;
  durationMin: number;
  ruleId: Types.ObjectId;
  topic: '';
  status: 'scheduled';
  recordings: [];
}

/** Документы новых занятий для `insertMany` — без `_id`, добавит Mongoose. */
export function buildLessonDocs(
  classId: Types.ObjectId,
  missing: readonly ExpectedOccurrence[],
): NewLessonDoc[] {
  return missing.map((occurrence) => ({
    classId,
    plannedAt: occurrence.plannedAt.toJSDate(),
    startsAt: occurrence.plannedAt.toJSDate(),
    durationMin: occurrence.durationMin,
    ruleId: occurrence.ruleId,
    topic: '',
    status: 'scheduled',
    recordings: [],
  }));
}
