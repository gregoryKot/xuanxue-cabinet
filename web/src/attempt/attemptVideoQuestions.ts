// Видео-вопросы попытки — чистые функции, отдельно от рендера ради юнит-теста
// без DOM. collectVideoQuestions собирает их для экрана «Отправлено»
// (AttemptSubmittedVideos.tsx), индекс — тот же, что на форме сдачи
// (AttemptBlock.tsx нумерует вопросы внутри своего блока, не сквозным счётом
// попытки): номер у вопроса на «Отправлено» должен совпадать с тем, что
// ученик видел при сдаче. awaitsVideoAnswer — критерий фонового опроса,
// пока ждём видео из Telegram (useAttemptVideoPoll.ts).
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

/** Есть ли у попытки видео-вопрос, ответ на который ещё не пришёл — критерий
 * фонового опроса (useAttemptVideoPoll.ts, ADR-0076): пока `true`, тик
 * перечитывает попытку, иначе не ходит в сеть вовсе. Запись без `itemId`
 * (ADR-0037: старый инстанс мог записать её без вопроса во время деплоя,
 * expand → contract — комментарий у `ExamMediaDto.itemId`,
 * shared/src/exam-media.ts) чужой вопрос не закрывает: `undefined` не
 * совпадёт ни с одним `question.itemId`, и вопрос останется «ждущим».
 *
 * Оценённая попытка (`graded`) не ждёт ничего: учитель уже посмотрел работу,
 * и досланное видео ничего на экране не изменит. Иначе открытая вкладка со
 * старой попыткой, куда видео так и не прислали, опрашивала бы сервер до
 * закрытия браузера. */
export function awaitsVideoAnswer(attempt: ExamAttemptDto): boolean {
  if (attempt.status === 'graded') return false;
  const media = attempt.media ?? [];
  return collectVideoQuestions(attempt).some(
    ({ question }) => !media.some((item) => item.itemId === question.itemId),
  );
}
