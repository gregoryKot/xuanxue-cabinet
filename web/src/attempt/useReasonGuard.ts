// Проверка объяснения перед отправкой (ADR-0146) — своим хуком, а не
// строками в AttemptInProgress.tsx, тем же приёмом, что useUnansweredMarks.ts
// (тот файл — рядом, соседняя, но отдельная проверка: без ответа отправить
// всё равно можно, без объяснения — нет). Правило «чего не хватает» — в
// attemptReasonGuard.ts, тестируется без DOM.
import { useCallback, useState } from 'react';
import type { AttemptAnswerDto, AttemptBlockDto } from '@xuanxue/shared';
import type { FormError } from '../components/FormServerError';
import { checkMissingReasons } from './attemptReasonGuard';

export interface ReasonGuard {
  /** Ученик хотя бы раз нажал «Отправить» — с этой минуты поле объяснения
   * без текста подсвечено (AttemptQuestion.tsx). */
  checked: boolean;
  /** Текст отказа (formatMissingReasonMessage) в слот ошибки отправки — `null`,
   * пока проверка не запускалась или объяснять нечего. */
  error: FormError | null;
  /** Запускает проверку и подсвечивает поля; `true` — объяснений хватает,
   * отправку можно продолжать (открыть подтверждение «без ответов» или
   * отправить сразу). */
  check: () => boolean;
}

export function useReasonGuard(
  blocks: readonly AttemptBlockDto[],
  getAnswer: (itemId: string) => AttemptAnswerDto | undefined,
): ReasonGuard {
  const [checked, setChecked] = useState(false);

  const check = useCallback(() => {
    setChecked(true);
    return checkMissingReasons(blocks, getAnswer) === null;
  }, [blocks, getAnswer]);

  // Пересчитывается на каждый рендер, как и у useUnansweredMarks.ts: ответы
  // живут в ref автосохранения и меняются на каждый символ, поэтому отметка
  // и текст отказа гаснут сами, как только объяснение дописано.
  const message = checked ? checkMissingReasons(blocks, getAnswer) : null;

  return { checked, error: message ? { message } : null, check };
}
