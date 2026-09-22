// Подсветка вопросов без ответа на форме сдачи (просьба владельца
// 2026-09-22) — своим хуком, а не строками в AttemptInProgress.tsx: там уже
// живут автосохранение, дедлайн и отправка, а компонент React держим до 150
// строк (CLAUDE.md «Храповики»). Само правило «ответ есть / ответа нет» —
// в attemptUnanswered.ts, оно тестируется без DOM.
//
// Список считается на каждый отрисованный кадр, а не в момент нажатия:
// ответы лежат в ref автосохранения (useAttemptAutosave.ts) и меняются на
// каждый символ, поэтому отметка гаснет сама, как только на вопрос ответили
// — ученик возвращается из подтверждения, дописывает ответ и видит, что
// подсветка ушла, без второго круга «Отправить».
import { useCallback, useState } from 'react';
import type { AttemptAnswerDto, AttemptBlockDto, ExamMediaDto } from '@xuanxue/shared';
import { collectUnansweredIds } from './attemptUnanswered';

// Пока «Отправить» не нажимали, подсвечивать нечего: форму ещё заполняют.
const NO_MARKS: ReadonlySet<string> = new Set<string>();

export interface UnansweredMarks {
  /** itemId подсвеченных вопросов — пусто до первого «Отправить». */
  marked: ReadonlySet<string>;
  /** Сколько вопросов без ответа сейчас — число идёт в подтверждение. */
  count: number;
  /** Ученик нажал «Отправить»: с этой минуты пропуски видны в форме. */
  check: () => void;
}

export function useUnansweredMarks(
  blocks: readonly AttemptBlockDto[],
  getAnswer: (itemId: string) => AttemptAnswerDto | undefined,
  media: readonly ExamMediaDto[],
): UnansweredMarks {
  const [checked, setChecked] = useState(false);
  const check = useCallback(() => setChecked(true), []);
  const unanswered = collectUnansweredIds(blocks, getAnswer, media);

  return {
    marked: checked ? new Set(unanswered) : NO_MARKS,
    count: unanswered.length,
    check,
  };
}
