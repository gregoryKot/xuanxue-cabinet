// Текущее время с перерасчётом раз в `intervalMs` (ТЗ п.2: «пересчёт раз в
// 30 секунд») — общий примитив для обратного отсчёта дедлайна попытки
// (AttemptScreen.tsx + attemptDeadline.ts) и для строки времени на карточке
// экзамена (student/StudentExamTime.tsx, ADR-0122).
//
// `null` — «пересчитывать нечего»: у формы без идущей попытки строка времени
// не меняется от секунды к секунде, и будить React раз в полминуты ради
// неподвижного текста незачем — заданий на экране бывает десяток, а открыт
// он с телефона. Хук зовётся всегда (правила хуков), таймер заводится нет.
import { useEffect, useState } from 'react';
import { serverNow } from '../api/serverClock';

export function useNow(intervalMs: number | null): number {
  // По часам сервера, не устройства (serverClock.ts, аудит 2026-10-01):
  // дедлайн решает сервер, и отсчёт на экране должен идти по тем же часам.
  const [now, setNow] = useState(() => serverNow());

  useEffect(() => {
    if (intervalMs === null) return;
    const id = window.setInterval(() => setNow(serverNow()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
