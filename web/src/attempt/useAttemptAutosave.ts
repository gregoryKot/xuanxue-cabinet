// Автосохранение ответов попытки (ТЗ п.2, ADR-0022 «автосохранение и
// возврат»): PATCH через 2 секунды после последней правки, сбой не теряет
// ответ — повтор идёт сам, без кнопки, и снова при первой возможности, если
// сеть на телефоне вернулась (`online`, useAttemptAutosaveLifecycle.ts).
// Ответы держим в `Map` через ref, а не в состоянии: правка на каждый символ
// не должна пересобирать объект и гонять сравнение всего списка — счётчик
// ниже только просит React перерисовать поле, которое уже показывает
// актуальное значение из ref. Каждая правка дублируется и в localStorage —
// attemptLocalDraft.ts (аудит 2026-09-21, «потеря ответа ученика»): копия не
// должна жить только здесь.
//
// Само сохранение (дебаунс, повтор, `flush()` с промисом — аудит 2026-09-21,
// HIGH «потеря последнего ответа ученика») — useAttemptSaveRunner.ts: этот
// файл держит только карту ответов и то, что из неё «грязно».
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AttemptAnswerDto } from '@xuanxue/shared';
import { bootstrapAttemptAnswers, writeAttemptAnswerDraft } from './attemptLocalDraft';
import { useAttemptAutosaveLifecycle } from './useAttemptAutosaveLifecycle';
import { useAttemptSaveRunner, type AutosaveStatus } from './useAttemptSaveRunner';

export type { AutosaveStatus } from './useAttemptSaveRunner';

export interface UseAttemptAutosaveResult {
  getAnswer: (itemId: string) => AttemptAnswerDto | undefined;
  setText: (itemId: string, text: string) => void;
  setOptions: (itemId: string, optionIds: string[]) => void;
  /** Сохранить прямо сейчас, не дожидаясь дебаунса — «уход с вопроса» (ТЗ) и
   * условие отправки попытки. Резолвится, когда все правки (и уже летящая
   * попытка, и то, что только копилось) реально на сервере; реджектится при
   * сбое — без ожидания фонового повтора (useAttemptSaveRunner.ts). */
  flush: () => Promise<void>;
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
  // Серверный снимок — база, черновик localStorage — поверх (attemptLocalDraft.ts).
  const [bootstrap] = useState(() => bootstrapAttemptAnswers(attemptId, initialAnswers));
  const answers = useRef(bootstrap.answers);
  const dirty = useRef(new Set<string>(bootstrap.recoveredIds));
  const [, bump] = useState(0);

  const { scheduleSave, flush, status } = useAttemptSaveRunner(
    attemptId,
    dirty,
    answers,
    onExpired,
  );

  const setAnswer = useCallback(
    (itemId: string, patch: Omit<AttemptAnswerDto, 'itemId'>) => {
      const answer = { itemId, ...patch };
      answers.current.set(itemId, answer);
      dirty.current.add(itemId);
      writeAttemptAnswerDraft(attemptId, answer);
      bump((n) => n + 1);
      scheduleSave();
    },
    [attemptId, scheduleSave],
  );

  const setText = useCallback(
    (itemId: string, text: string) => setAnswer(itemId, { text }),
    [setAnswer],
  );
  const setOptions = useCallback(
    (itemId: string, optionIds: string[]) => setAnswer(itemId, { optionIds }),
    [setAnswer],
  );

  useAttemptAutosaveLifecycle(flush);

  // Монтирование — досылаем уцелевший черновик (flush() сам ничего не шлёт,
  // если восстанавливать нечего); сбой здесь фоновый, не критичный (см.
  // комментарий-шапку useAttemptAutosaveLifecycle.ts).
  useEffect(() => {
    flush().catch(() => {
      /* фоновая попытка — сбой уже виден в status */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- один раз при монтировании
  }, []);

  const getAnswer = useCallback((itemId: string) => answers.current.get(itemId), []);

  return { getAnswer, setText, setOptions, flush, status };
}
