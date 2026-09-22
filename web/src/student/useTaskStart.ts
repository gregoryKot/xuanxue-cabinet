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
import { getExamStartConfirm, type ExamStartConfirm } from './examStartConfirm';
import { useMyExams } from './MyExamsProvider';
import { resolveTaskStartTarget } from './resolveTaskStartTarget';

const START_ERROR_MESSAGE = 'Не удалось начать попытку. Попробуйте ещё раз.';

/** Открытый вопрос «Вы начинаете экзамен»: чей он и какими словами задан. */
export interface ExamStartConfirmState {
  exam: MyExamDto;
  copy: ExamStartConfirm;
}

export interface UseTaskStartResult {
  pendingExamId: string | null;
  errors: Record<string, string>;
  /** `null`, когда диалог закрыт (TasksScreen рисует ConfirmDialog, пока не
   * null) — тексты уже посчитаны, экран берёт их готовыми. */
  confirm: ExamStartConfirmState | null;
  start: (exam: MyExamDto) => void;
  /** Кнопка «Начать экзамен» в диалоге — сюда переехал реальный POST. */
  confirmStart: (exam: MyExamDto) => Promise<void>;
  /** «Не сейчас» — и то же закрытие диалога после успешного старта (см.
   * комментарий вверху файла: обе причины закрывают диалог одинаково). */
  cancelConfirm: () => void;
}

export function useTaskStart(): UseTaskStartResult {
  const { startAttempt, applyAttempt } = useMyExams();
  const navigate = useNavigate();
  const [pendingExamId, setPendingExamId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // В состоянии и сам экзамен, и уже готовые тексты вопроса: `start` ниже всё
  // равно зовёт getExamStartConfirm, чтобы решить, спрашивать ли, — экран,
  // считая их второй раз у себя, повторял бы ту же работу и держал бы ветку
  // «экзамен есть, а текстов нет», недостижимую по построению.
  const [confirm, setConfirm] = useState<ExamStartConfirmState | null>(null);
  const [startedAttempt, setStartedAttempt] = useState<ExamAttemptDto | null>(null);

  useEffect(() => {
    if (startedAttempt && !confirm) {
      void navigate(`/attempts/${startedAttempt.id}`);
      setStartedAttempt(null);
    }
  }, [startedAttempt, confirm, navigate]);

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
      const copy = getExamStartConfirm(exam);
      if (copy) {
        setConfirm({ exam, copy });
        return;
      }

      void runStart(exam);
    },
    [navigate, runStart],
  );

  const cancelConfirm = useCallback(() => setConfirm(null), []);

  return {
    pendingExamId,
    errors,
    confirm,
    start,
    // Экзамен приходит параметром, а не читается из состояния: диалог
    // рисуется только при непустом `confirm`, и проверка «а есть ли что
    // стартовать» внутри была бы веткой, до которой не добраться ни одним
    // тестом (CLAUDE.md, правило 1д: лучше убрать саму возможность ошибки,
    // чем сторожить её недостижимым `if`).
    confirmStart: runStart,
    cancelConfirm,
  };
}
