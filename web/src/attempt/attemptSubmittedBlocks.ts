// Блоки попытки для раздела «Ваши ответы» на экране «Отправлено»
// (AttemptSubmittedAnswers.tsx) — чистая функция, отдельно от рендера ради
// юнит-теста без DOM (CLAUDE.md «Логика вне компонентов»), по образцу
// соседнего attemptVideoQuestions.ts.
//
// Видео-вопрос сюда не попадает: его состояние (пришло видео или нет) и
// возможность дослать запись живут в блоке «Видео» ниже
// (AttemptSubmittedVideos.tsx) — та же формулировка вопроса на одном экране
// дважды читалась бы как два сообщения об одном.
//
// `index` — место вопроса в блоке, то же самое, что ученик видел на форме
// сдачи (AttemptBlock.tsx нумерует так же — позиция ДО фильтрации) и что
// показывает блок «Видео». Пропущенный номер в списке ниже — не баг: это
// видео-вопрос, и ученик найдёт его под тем же номером в блоке «Видео».
import type {
  AttemptAnswerDto,
  AttemptQuestionDto,
  ExamAttemptDto,
} from '@xuanxue/shared';

export interface SubmittedQuestion {
  question: AttemptQuestionDto;
  /** Номер вопроса внутри блока — тот же, что ученик видел на форме сдачи. */
  index: number;
  answer?: AttemptAnswerDto;
}

export interface SubmittedBlock {
  id: string;
  title: string;
  questions: SubmittedQuestion[];
}

export function collectSubmittedBlocks(attempt: ExamAttemptDto): SubmittedBlock[] {
  return attempt.blocks
    .map((block) => ({
      id: block.id,
      title: block.title,
      questions: block.questions
        .map((question, index) => ({
          question,
          index,
          answer: attempt.answers.find((item) => item.itemId === question.itemId),
        }))
        .filter(({ question }) => question.kind !== 'video'),
    }))
    .filter((block) => block.questions.length > 0);
}
