// Подсказка над строкой выбора варианта у вопроса с требованием объяснения
// (ADR-0146) — вынесено из exam-question-screen.ts: тот файл стоит на
// границе лимита размера (CLAUDE.md «Храповики»), а это отдельный кусок
// текста, не логика самого экрана.
import { ATTEMPT_REASON_LABEL, type AttemptAnswerDto } from '@xuanxue/shared';

export function buildReasonNote(answer: AttemptAnswerDto | undefined): string {
  return answer?.text
    ? `Ваше объяснение: «${answer.text}» — пришлите новое, если хотите заменить.`
    : `${ATTEMPT_REASON_LABEL} — выберите вариант и напишите объяснение сообщением, прямо сюда.`;
}
