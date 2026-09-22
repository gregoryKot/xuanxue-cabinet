// Строка про время на карточке экзамена (ADR-0122): сколько даётся на
// попытку, а пока попытка идёт — сколько осталось и когда она закроется.
// Что именно сказать, решает `describeExamTime` в shared — одна формулировка
// на кабинет и на бота (ADR-0091 про то, чем кончаются две).
//
// Хук, а не расчёт в компоненте: нужен тик. Дедлайн попытки абсолютный,
// пауз нет — ученик может открыть «Задания» и оставить их на экране, и без
// пересчёта он смотрел бы на остаток получасовой давности. Полминуты —
// шаг, которого хватает строке без секунд (живой посекундный отсчёт — на
// самом экране сдачи, AttemptDeadlineTimer.tsx).
import { describeExamTime, type MyExamDto } from '@xuanxue/shared';
import { useNow } from '../attempt/useNow';
import { examTimeZoneNote } from './examAttemptState';

const TICK_MS = 30_000;

export function useExamTimeLine(exam: MyExamDto): string | null {
  const attempt = exam.lastAttempt;
  // Тикать есть смысл только у идущей попытки: у остальных строка
  // неподвижна («На попытку даётся 40 минут»), и таймер там лишний —
  // заданий на экране бывает десяток (useNow принимает `null`).
  const running = attempt?.status === 'in_progress' && attempt.deadlineAt !== undefined;
  const nowMs = useNow(running ? TICK_MS : null);
  // Без `timeZone` — час считается по часам устройства зрителя, другого
  // источника его пояса у нас нет (ADR-0060); приписку про пояс школы
  // добавляет `examTimeZoneNote`, когда часы разные.
  return describeExamTime(exam, { nowMs, zoneNote: examTimeZoneNote() });
}
