// Старт/переход по кнопке карточки задания — вынесено из TasksScreen.tsx
// (CLAUDE.md «Логика вне компонентов», лимит размера файла). Оба замка
// ADR-0119 живут здесь: resolveTaskStartTarget.ts решает, открыть ли уже
// известную попытку без запроса («Продолжить»), а успешный `startAttempt`
// сразу правит список через `applyAttempt` (MyExamsProvider.tsx) — без
// второго `GET /me/exams`.
//
// Подтверждение перед стартом (отзыв владельца 2026-09-22, ADR-0121): у
// формы с лимитом времени «Начать»/«Пройти ещё раз» сперва открывает вопрос
// (getExamStartConfirm, examStartConfirm.ts), а реальный POST уходит только
// из confirmStart(). Переход на экран попытки отложен эффектом до того, как
// confirmExam вернулся в null, — то есть ConfirmDialog действительно
// закрылся: он сам зовёт единственный goBack() после onConfirm
// (ConfirmDialog.tsx), и navigate() внутри onConfirm этот же goBack()
// откатил бы (поймано на прошлой реализации; тот же приём, что
// useConfirmedRemove.ts, комментарий там же).
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ExamAttemptDto, MyExamDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { getExamStartConfirm } from './examStartConfirm';
import { useMyExams } from './MyExamsProvider';
import { resolveTaskStartTarget } from './resolveTaskStartTarget';

const START_ERROR_MESSAGE = 'Не удалось начать попытку. Попробуйте ещё раз.';

export interface UseTaskStartResult {
  pendingExamId: string | null;
  errors: Record<string, string>;
  /** Экзамен, для которого открыт вопрос «Вы начинаете экзамен» — `null`,
   * когда диалог закрыт (TasksScreen рисует ConfirmDialog, пока не null). */
  confirmExam: MyExamDto | null;
  start: (exam: MyExamDto) => void;
  /** Кнопка «Начать экзамен» в диалоге — сюда переехал реальный POST. */
  confirmStart: () => Promise<void>;
  /** «Не сейчас» — и то же закрытие диалога после успешного старта (см.
   * комментарий вверху файла: обе причины закрывают диалог одинаково). */
  cancelConfirm: () => void;
}

export function useTaskStart(): UseTaskStartResult {
  const { startAttempt, applyAttempt } = useMyExams();
  const navigate = useNavigate();
  const [pendingExamId, setPendingExamId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmExam, setConfirmExam] = useState<MyExamDto | null>(null);
  const [startedAttempt, setStartedAttempt] = useState<ExamAttemptDto | null>(null);

  useEffect(() => {
    if (startedAttempt && !confirmExam) {
      void navigate(`/attempts/${startedAttempt.id}`);
      setStartedAttempt(null);
    }
  }, [startedAttempt, confirmExam, navigate]);

  const runStart = useCallback(
    async (exam: MyExamDto) => {
      setPendingExamId(exam.id);
      setErrors((prev) => ({ ...prev, [exam.id]: '' }));
      try {
        const attempt = await startAttempt(exam.id);
        // Список правится ответом самого POST, без второго GET (замок 2) —
        // иначе «Осталось N попыток» и следующее «Продолжить» отставали бы
        // от того, что уже произошло на сервере.
        applyAttempt(attempt);
        setStartedAttempt(attempt);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : START_ERROR_MESSAGE;
        setErrors((prev) => ({ ...prev, [exam.id]: message }));
      } finally {
        setPendingExamId(null);
      }
    },
    [startAttempt, applyAttempt],
  );

  const start = useCallback(
    (exam: MyExamDto) => {
      // «Продолжить» — попытка уже есть, её id известен из списка: открываем
      // прямо её, без похода на сервер (замок 1). Устаревший список (попытку
      // уже отправили, а карточка ещё думает «в работе») в худшем случае
      // откроет экран уже отправленной попытки — не заведёт вторую.
      const target = resolveTaskStartTarget(exam);
      if (target.kind === 'open') {
        void navigate(`/attempts/${target.attemptId}`);
        return;
      }

      // Лимит времени и реальный старт («start»/«retry») — сперва вопрос;
      // POST уходит только из confirmStart().
      if (getExamStartConfirm(exam)) {
        setConfirmExam(exam);
        return;
      }

      void runStart(exam);
    },
    [navigate, runStart],
  );

  const confirmStart = useCallback(async () => {
    if (confirmExam) await runStart(confirmExam);
  }, [confirmExam, runStart]);

  const cancelConfirm = useCallback(() => setConfirmExam(null), []);

  return {
    pendingExamId,
    errors,
    confirmExam,
    start,
    confirmStart,
    cancelConfirm,
  };
}
