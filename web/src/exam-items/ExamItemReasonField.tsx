// Переключатель «просить объяснение» (ADR-0146) — общий для страницы вопроса
// (ExamItemEditorForm.tsx) и инлайн-формы в редакторе экзамена
// (exams/QuestionInlineForm.tsx), одна реализация вместо двух копий
// (CLAUDE.md «Одна механика — один компонент»). Только у single/multiple —
// у text/video объяснять нечего (ASK_REASON_KIND_MESSAGE на сервере), поэтому
// сам решает, рисоваться ли, а не заставляет оба вызывающих места повторять
// `hasOptions(state.kind) && (...)`.
import { Toggle } from '../components/Toggle';
import { hasOptions, type ExamItemFormState } from './examItemFormInput';

const LABEL = 'Попросить объяснить ответ';
// VOICE: короткий факт-следствие, без канцелярита — check-robot-phrases.mjs.
const HINT = 'Ученик объяснит выбор текстом. Без объяснения работу не отправить.';

interface ExamItemReasonFieldProps {
  state: ExamItemFormState;
  setField: <K extends keyof ExamItemFormState>(
    key: K,
    value: ExamItemFormState[K],
  ) => void;
}

export function ExamItemReasonField({ state, setField }: ExamItemReasonFieldProps) {
  if (!hasOptions(state.kind)) return null;
  return (
    <Toggle
      label={LABEL}
      hint={HINT}
      checked={state.askReason}
      onChange={(checked) => setField('askReason', checked)}
    />
  );
}
