// Фоновый опрос попытки, пока ждём видео-ответ из Telegram. Механизм —
// usePollWhileVisible, уже выбранный ADR-0076 (лента уведомлений опрашивает
// им же, раз в минуту, пока вкладка видима): здесь та же обвязка, но другая
// причина её звать — видео-вопрос отвечается не в этой вкладке, а сообщением
// боту (ADR-0023) на конкретный вопрос попытки (ADR-0037), и ученик,
// вернувшийся из Telegram, без опроса видел бы прежнюю форму «пришлите
// запись» до ручной перезагрузки страницы — нарушение Read-after-write
// (CLAUDE.md).
//
// Тик перечитывает попытку, только пока `awaitsVideoAnswer(attempt)`:
// попытка без видео-вопросов или с уже полученными видео в сеть не ходит
// вовсе. usePollWhileVisible вызывается безусловно (правило хуков,
// exhaustive-deps) — решение «звать refresh или нет» живёт внутри тика, не
// снаружи хука.
import { useCallback, useEffect, useRef } from 'react';
import type { ExamAttemptDto } from '@xuanxue/shared';
import { usePollWhileVisible } from '../hooks/usePollWhileVisible';
import { awaitsVideoAnswer } from './attemptVideoQuestions';

/** Заметно короче минутного ритма ленты уведомлений
 * (NOTIFICATIONS_POLL_INTERVAL_MS, ADR-0076): ученик открыл вкладку ради
 * этого конкретного видео и ждёт его активнее, а сам тик почти всегда
 * бесплатен для сервера — пока видео не пришло, это тот же `GET /attempts`,
 * что и без опроса. */
export const ATTEMPT_VIDEO_POLL_INTERVAL_MS = 15_000;

/**
 * `attempt` держим в ref, а не в зависимостях `useCallback` — тот же приём,
 * что `loadRef` в useAbortableFetch.ts и `refreshRef` в
 * usePollWhileVisible.ts: иначе каждый новый снимок попытки (после
 * reload()/refresh()) пересобирал бы тик без надобности — usePollWhileVisible
 * и так подхватывает свежую функцию на каждый рендер через свой собственный
 * ref.
 */
export function useAttemptVideoPoll(
  attempt: ExamAttemptDto | null,
  refresh: () => Promise<void>,
): void {
  const attemptRef = useRef(attempt);
  useEffect(() => {
    attemptRef.current = attempt;
  });

  const tick = useCallback(() => {
    const current = attemptRef.current;
    if (!current || !awaitsVideoAnswer(current)) return;
    void refresh();
  }, [refresh]);

  usePollWhileVisible(tick, ATTEMPT_VIDEO_POLL_INTERVAL_MS);
}
