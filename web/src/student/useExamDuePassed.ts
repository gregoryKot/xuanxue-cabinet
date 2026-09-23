// Прошёл ли срок сдачи прямо сейчас (ADR-0125) — хук с тиком, тем же приёмом,
// что useExamTimeLine.ts: ученик может оставить «Задания» открытыми, и без
// пересчёта кнопка «Начать» не спряталась бы сама в момент, когда срок
// истёк. Само правило «прошёл или нет» — одна функция в shared
// (isExamDuePassed, exam-time.ts), общая с сервером (ExamAttemptsService.start)
// — вторую реализацию сравнения дат здесь не заводим.
import { isExamDuePassed, type MyExamDto } from '@xuanxue/shared';
import { useNow } from '../attempt/useNow';

const TICK_MS = 30_000;

export function useExamDuePassed(exam: MyExamDto): boolean {
  const nowMs = useNow(exam.dueAt !== undefined ? TICK_MS : null);
  return isExamDuePassed(exam.dueAt, nowMs);
}
