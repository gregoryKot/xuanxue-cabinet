// Текущее время с перерасчётом раз в `intervalMs` (ТЗ п.2: «пересчёт раз в
// 30 секунд») — общий примитив для обратного отсчёта дедлайна попытки
// (AttemptScreen.tsx + attemptDeadline.ts). Не тянет собственный тест: чистой
// логики здесь нет, только `setInterval`, поведение проверяет
// AttemptScreen.test.tsx через fake timers.
import { useEffect, useState } from 'react';

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
