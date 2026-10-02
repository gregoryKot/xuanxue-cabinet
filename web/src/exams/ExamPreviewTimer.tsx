// Таймер на странице «Глазами ученика» (просьба владельца 2026-10-02:
// «добавь таймер»). Учитель должен видеть экран сдачи целиком, а у экзамена
// с лимитом времени на нём тикает отсчёт.
//
// Попытки в предпросмотре нет, дедлайна от сервера тоже, поэтому отсчёт идёт
// от открытия страницы — как у ученика он идёт от начала попытки — и стартует
// с полного лимита экзамена `timeLimitMin`. Строку рисует ТА ЖЕ
// AttemptTimerLine, что и на экране ученика (attempt/AttemptDeadlineTimer.tsx),
// а текст и пороги считает та же getRemainingTimeStatus: разметка, стили и
// подписи разойтись не могут. На нуле — «Время вышло», как у ученика; больше
// ничего не происходит: закрывать нечего, сервер не спрашиваем.
//
// Отдельный компонент, а не часть ExamPreview.tsx: тикает раз в секунду сам по
// себе и не перерисовывает список вопросов ниже (тот же довод, что у
// AttemptDeadlineTimer.tsx).
import { useState } from 'react';
import { serverNow } from '../api/serverClock';
import { AttemptTimerLine } from '../attempt/AttemptDeadlineTimer';
import { getRemainingTimeStatus } from '../attempt/attemptDeadline';
import { useNow } from '../attempt/useNow';

const NOW_REFRESH_MS = 1000;
const MINUTE_MS = 60_000;

interface ExamPreviewTimerProps {
  /** Лимит экзамена в минутах. Обязателен: экзамен без лимита этот
   * компонент не монтирует вовсе (ExamPreview.tsx), как и у ученика. */
  timeLimitMin: number;
}

export function ExamPreviewTimer({ timeLimitMin }: ExamPreviewTimerProps) {
  // Момент открытия фиксируем один раз: useState с инициализатором, не
  // useRef и не useMemo — React не обещает сохранять мемо, а отсчёт, который
  // перезапустится сам, учителя обманет.
  const [startedAt] = useState(() => serverNow());
  const now = useNow(NOW_REFRESH_MS);
  // Не меньше нуля: часы сервера поправляются по заголовку `Date` ответов
  // (serverClock.ts), и шаг назад показал бы «45:01» поверх полного лимита.
  const elapsedMs = Math.max(0, now - startedAt);
  const remainingMs = timeLimitMin * MINUTE_MS - elapsedMs;

  return <AttemptTimerLine status={getRemainingTimeStatus(remainingMs)} />;
}
