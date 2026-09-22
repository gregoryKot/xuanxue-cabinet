// Само сохранение попытки — дебаунс, повтор после сбоя, flush() с промисом.
// Вынесено из useAttemptAutosave.ts (храповик размера файлов, CLAUDE.md
// «Храповики»): `dirty` и `answers` остаются в вызывающем хуке — их пишет
// setAnswer на каждую правку ученика, здесь они только читаются.
//
// `flush()` возвращает промис (аудит 2026-09-21, HIGH «потеря последнего
// ответа ученика»): `submit()` (useAttempt.ts) слал POST сразу, не дожидаясь
// PATCH — выбор варианта/blur мог ещё лететь или ждать дебаунса, сервер
// запирал попытку раньше, чем ответ доходил. Теперь `flush()` резолвится,
// только когда правки реально на сервере (и уже летящий запрос, и то, что
// копилось), и реджектится при сбое без ожидания фонового 4-секундного
// повтора — AttemptInProgress.tsx ждёт этот промис перед submit().
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { ATTEMPT_EXPIRED_MESSAGE, type AttemptAnswerDto } from '@xuanxue/shared';
import { apiFetch, ApiError } from '../api/http';
import { clearAttemptDraft, forgetSavedAnswers } from './attemptLocalDraft';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 2000;
const RETRY_DELAY_MS = 4000;

export interface UseAttemptSaveRunnerResult {
  scheduleSave: () => void;
  /** Резолвится, когда все правки реально на сервере; реджектится при сбое —
   * без ожидания фонового повтора (комментарий в шапке файла). */
  flush: () => Promise<void>;
  status: AutosaveStatus;
}

export function useAttemptSaveRunner(
  attemptId: string,
  dirty: MutableRefObject<Set<string>>,
  answers: MutableRefObject<Map<string, AttemptAnswerDto>>,
  onExpired?: () => void,
): UseAttemptSaveRunnerResult {
  const debounceTimer = useRef<number | null>(null);
  const retryTimer = useRef<number | null>(null);
  const saving = useRef(false);
  // Промис уже летящего PATCH — второй одновременный вызов runSave() (flush
  // во время фонового сохранения и наоборот) не открывает второй запрос, а
  // ждёт тот же исход.
  const inFlight = useRef<Promise<void> | null>(null);
  const [status, setStatus] = useState<AutosaveStatus>('idle');

  const runSave = useCallback(
    async (options?: { propagate?: boolean }): Promise<void> => {
      if (dirty.current.size === 0) return;
      if (saving.current) {
        // Уже летит PATCH с этими правками — не второй запрос, а ожидание
        // его исхода; если после него остаётся что сохранять (новая правка
        // или этот же провалился), пробуем сами.
        if (inFlight.current) await inFlight.current.catch(() => undefined);
        return runSave(options);
      }
      const ids = [...dirty.current];
      // `dirty` и `answers` заполняются в одной операции (setAnswer в
      // useAttemptAutosave.ts), так что запись всегда есть — фильтр вместо
      // `!` (CLAUDE.md «Код»: без non-null assertion там, где можно
      // спокойно обойтись).
      const body = {
        answers: ids
          .map((id) => answers.current.get(id))
          .filter((a): a is AttemptAnswerDto => a !== undefined),
      };
      saving.current = true;
      setStatus('saving');
      const attempt = apiFetch(`/attempts/${attemptId}/answers`, {
        method: 'PATCH',
        body,
      })
        .then(() => {
          for (const id of ids) dirty.current.delete(id);
          // Ушло на сервер — локальная копия этих ответов не нужна.
          forgetSavedAnswers(attemptId, ids);
          setStatus('saved');
        })
        .catch((err: unknown) => {
          setStatus('error');
          if (err instanceof ApiError && err.message === ATTEMPT_EXPIRED_MESSAGE) {
            // Попытка закрыта дедлайном — черновик убирается целиком.
            clearAttemptDraft(attemptId);
            onExpired?.();
          } else {
            if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
            retryTimer.current = window.setTimeout(() => void runSave(), RETRY_DELAY_MS);
          }
          throw err;
        })
        .finally(() => {
          saving.current = false;
          inFlight.current = null;
        });
      inFlight.current = attempt;
      // propagate (flush перед submit) — отдаём настоящий исход вызывающему
      // без вмешательства; фоновым вызовам (дебаунс/лайфсайкл/монтирование)
      // он не важен — статус и retryTimer выше уже отражают сбой.
      if (options?.propagate) return attempt;
      await attempt.catch(() => undefined);
    },
    // `dirty`/`answers` — рефы из вызывающего хука (useAttemptAutosave.ts),
    // их идентичность стабильна на весь срок жизни попытки; экзостив-деп
    // этого не знает про чужой useRef — перечисляем явно, пересоздания
    // callback'а это не добавляет.
    [attemptId, onExpired, dirty, answers],
  );

  const scheduleSave = useCallback(() => {
    if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => void runSave(), DEBOUNCE_MS);
  }, [runSave]);

  const flush = useCallback((): Promise<void> => {
    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    return runSave({ propagate: true });
  }, [runSave]);

  // Размонтирование — снимаем таймеры, ничего не улетает в пустоту.
  useEffect(() => {
    return () => {
      if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current);
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    };
  }, []);

  return { scheduleSave, flush, status };
}
