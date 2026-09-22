// Старт/переход по кнопке карточки задания — вынесено из TasksScreen.tsx
// (CLAUDE.md «Логика вне компонентов», лимит размера файла). Оба замка
// ADR-0119 живут здесь: resolveTaskStartTarget.ts решает, открыть ли уже
// известную попытку без запроса («Продолжить»), а успешный `startAttempt`
// сразу правит список через `applyAttempt` (MyExamsProvider.tsx) — без
// второго `GET /me/exams`.
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MyExamDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { useMyExams } from './MyExamsProvider';
import { resolveTaskStartTarget } from './resolveTaskStartTarget';

const START_ERROR_MESSAGE = 'Не удалось начать попытку. Попробуйте ещё раз.';

export interface UseTaskStartResult {
  pendingExamId: string | null;
  errors: Record<string, string>;
  start: (exam: MyExamDto) => void;
}

export function useTaskStart(): UseTaskStartResult {
  const { startAttempt, applyAttempt } = useMyExams();
  const navigate = useNavigate();
  const [pendingExamId, setPendingExamId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

      setPendingExamId(exam.id);
      setErrors((prev) => ({ ...prev, [exam.id]: '' }));
      void (async () => {
        try {
          const attempt = await startAttempt(exam.id);
          // Список правится ответом самого POST, без второго GET (замок 2) —
          // иначе «Осталось N попыток» и следующее «Продолжить» отставали бы
          // от того, что уже произошло на сервере.
          applyAttempt(attempt);
          void navigate(`/attempts/${attempt.id}`);
        } catch (err) {
          const message = err instanceof ApiError ? err.message : START_ERROR_MESSAGE;
          setErrors((prev) => ({ ...prev, [exam.id]: message }));
        } finally {
          setPendingExamId(null);
        }
      })();
    },
    [startAttempt, applyAttempt, navigate],
  );

  return { pendingExamId, errors, start };
}
