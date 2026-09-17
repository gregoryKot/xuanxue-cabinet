// Видео-вопросы попытки для экрана «Отправлено» (AttemptSubmittedVideos.tsx)
// — чистая выборка, отдельно от рендера ради юнит-теста без DOM. Индекс —
// тот же, что на форме сдачи (AttemptBlock.tsx нумерует вопросы внутри
// своего блока, не сквозным счётом попытки): номер у вопроса на «Отправлено»
// должен совпадать с тем, что ученик видел при сдаче.
import type { AttemptQuestionDto, ExamAttemptDto } from '@xuanxue/shared';

export interface AttemptVideoQuestion {
  question: AttemptQuestionDto;
  index: number;
}

export function collectVideoQuestions(attempt: ExamAttemptDto): AttemptVideoQuestion[] {
  return attempt.blocks.flatMap((block) =>
    block.questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => question.kind === 'video'),
  );
}
