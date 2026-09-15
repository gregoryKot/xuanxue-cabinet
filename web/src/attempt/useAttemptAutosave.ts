// Автосохранение ответов попытки (ТЗ п.2, ADR-0022 «автосохранение и
// возврат»): PATCH через 2 секунды после последней правки, сбой не теряет
// ответ — повтор идёт сам, без кнопки, и снова при первой возможности, если
// сеть на телефоне вернулась (`online`). Ответы держим в `Map` через ref, а
// не в состоянии: правка на каждый символ не должна пересобирать объект и
// гонять сравнение всего списка — счётчик ниже только просит React
// перерисовать поле, которое уже показывает актуальное значение из ref.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ATTEMPT_EXPIRED_MESSAGE, type AttemptAnswerDto } from '@xuanxue/shared';
import { apiFetch, ApiError } from '../api/http';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 2000;
const RETRY_DELAY_MS = 4000;

export interface UseAttemptAutosaveResult {
  getAnswer: (itemId: string) => AttemptAnswerDto | undefined;
  setText: (itemId: string, text: string) => void;
  setOptions: (itemId: string, optionIds: string[]) => void;
  /** Сохранить прямо сейчас, не дожидаясь дебаунса — «уход с вопроса» (ТЗ). */
  flush: () => void;
  status: AutosaveStatus;
}

export function useAttemptAutosave(
  attemptId: string,
  initialAnswers: readonly AttemptAnswerDto[],
  // Дедлайн решает сервер (ТЗ 4.4, п.7, «Дедлайн решает сервер») — сервер
  // ответил «время вышло» на PATCH, а не местные часы решили это сами.
  // Повторять сохранение дальше некуда, оно будет отклонено тем же образом
  // (гонка исключена — попытка на сервере уже закрыта): зовём `onExpired`
  // один раз, чтобы экран перечитал попытку и показал честный статус
  // (AttemptInProgress.tsx → useAttempt.reload), вместо бесконечного «пишет
  // ответы в пустоту» каждые 4 секунды.
  onExpired?: () => void,
): UseAttemptAutosaveResult {
  const answers = useRef(new Map(initialAnswers.map((a) => [a.itemId, a])));
  const dirty = useRef(new Set<string>());
  const debounceTimer = useRef<number | null>(null);
  const retryTimer = useRef<number | null>(null);
  const saving = useRef(false);
  const rerunPending = useRef(false);
  const [, bump] = useState(0);
  const [status, setStatus] = useState<AutosaveStatus>('idle');

  const runSave = useCallback(async () => {
    if (dirty.current.size === 0) return;
    if (saving.current) {
      rerunPending.current = true;
      return;
    }
    const ids = [...dirty.current];
    // `dirty` и `answers` заполняются в одной операции (setAnswer ниже), так
    // что запись всегда есть — фильтр вместо `!` (CLAUDE.md «Код»: без
    // non-null assertion там, где можно спокойно обойтись).
    const body = {
      answers: ids
        .map((id) => answers.current.get(id))
        .filter((a): a is AttemptAnswerDto => a !== undefined),
    };
    saving.current = true;
    setStatus('saving');
    try {
      await apiFetch(`/attempts/${attemptId}/answers`, { method: 'PATCH', body });
      for (const id of ids) dirty.current.delete(id);
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      if (err instanceof ApiError && err.message === ATTEMPT_EXPIRED_MESSAGE) {
        onExpired?.();
      } else {
        if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
        retryTimer.current = window.setTimeout(() => void runSave(), RETRY_DELAY_MS);
      }
    } finally {
      saving.current = false;
      if (rerunPending.current) {
        rerunPending.current = false;
        void runSave();
      }
    }
  }, [attemptId, onExpired]);

  const scheduleSave = useCallback(() => {
    if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => void runSave(), DEBOUNCE_MS);
  }, [runSave]);

  const flush = useCallback(() => {
    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    void runSave();
  }, [runSave]);

  const setAnswer = useCallback(
    (itemId: string, patch: Omit<AttemptAnswerDto, 'itemId'>) => {
      answers.current.set(itemId, { itemId, ...patch });
      dirty.current.add(itemId);
      bump((n) => n + 1);
      scheduleSave();
    },
    [scheduleSave],
  );

  const setText = useCallback(
    (itemId: string, text: string) => setAnswer(itemId, { text }),
    [setAnswer],
  );
  const setOptions = useCallback(
    (itemId: string, optionIds: string[]) => setAnswer(itemId, { optionIds }),
    [setAnswer],
  );

  // Возврат сети (телефон в метро) — сразу пробуем сохранить то, что
  // накопилось, не дожидаясь очередного таймера ретрая.
  useEffect(() => {
    function handleOnline() {
      if (dirty.current.size > 0) void runSave();
    }
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [runSave]);

  useEffect(
    () => () => {
      if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current);
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    },
    [],
  );

  const getAnswer = useCallback((itemId: string) => answers.current.get(itemId), []);

  return { getAnswer, setText, setOptions, flush, status };
}
