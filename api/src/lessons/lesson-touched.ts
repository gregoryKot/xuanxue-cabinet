// «Тронутое» занятие — учитель что-то в нём поменял руками, планировщик его
// не удаляет (docs/PLAN.md §6). Без Mongo, без DI (CLAUDE.md «Тесты»).
import type { Types } from 'mongoose';
import type { LessonRecord } from './lesson.schema';

type TouchFields = Pick<
  LessonRecord,
  | 'topic'
  | 'status'
  | 'startsAt'
  | 'plannedAt'
  | 'zoomLinkOverride'
  | 'zoomPasswordOverride'
  | 'note'
  | 'recordings'
  | 'leaderId'
>;

/** Занятие «тронуто» учителем — планировщик его не удаляет при смене или
 * удалении правила (docs/PLAN.md §6: «уже спланированные вручную не
 * трогает»). Занятие, у которого поменялось только время слота (перенесено
 * планировщиком, не учителем), тронутым не считается — см. `reconcileClass`
 * в lesson-reconcile.ts, где для него отдельное условие переноса. */
export function isLessonTouched(lesson: TouchFields): boolean {
  return (
    lesson.topic !== '' ||
    lesson.status !== 'scheduled' ||
    lesson.startsAt.getTime() !== lesson.plannedAt?.getTime() ||
    Boolean(lesson.zoomLinkOverride) ||
    Boolean(lesson.zoomPasswordOverride) ||
    Boolean(lesson.note) ||
    lesson.recordings.length > 0 ||
    Boolean(lesson.leaderId)
  );
}

/** Занятие, порождённое расписанием (`plannedAt` задан) — то, чем оперирует
 * согласование в lesson-reconcile.ts. `ruleId` — на какое правило класса оно
 * ссылается (перенос при смене времени/длительности правила); `durationMin`
 * — текущая длительность, нужна согласованию, чтобы заметить, что у правила
 * поменялась только она (`plannedAt` тот же). */
export type LessonLean = TouchFields & {
  _id: Types.ObjectId;
  plannedAt: Date;
  durationMin: number;
  ruleId?: Types.ObjectId;
};
