// Патч списка `GET /me/exams` ответом записи попытки (ADR-0119) — без
// второго `GET` после старта или отправки (CLAUDE.md «Свежее состояние»,
// ADR-0087): `POST /exams/:id/attempts` и `POST /attempts/:id/submit` уже
// возвращают свежий `ExamAttemptDto`, MyExamsProvider.tsx кладёт его сюда
// через `applyAttempt`.
//
// Находит экзамен по `attempt.examId` и обновляет `lastAttempt`. Новая
// попытка (id, которого в `lastAttempt` ещё не было) — `attemptsUsed`
// растёт на 1 и старые `outcome`/`comment` не переезжают на неё: они от
// прошлой попытки, для новой оценки ещё нет. Та же попытка (просто сменила
// статус — старт вернул уже открытую, отправка перевела в submitted) —
// `outcome`/`comment` сохраняются как были.
//
// Чистая функция, без DOM и без сети — тест ниже.
import type { ExamAttemptDto, MyExamDto } from '@xuanxue/shared';

export function applyExamAttempt(
  exams: MyExamDto[] | null,
  attempt: ExamAttemptDto,
): MyExamDto[] | null {
  if (exams === null) return null;

  return exams.map((exam) => {
    if (exam.id !== attempt.examId) return exam;

    const isNewAttempt = exam.lastAttempt?.id !== attempt.id;
    const lastAttempt: NonNullable<MyExamDto['lastAttempt']> = isNewAttempt
      ? { id: attempt.id, status: attempt.status, expired: attempt.expired }
      : {
          ...exam.lastAttempt,
          id: attempt.id,
          status: attempt.status,
          expired: attempt.expired,
        };

    return {
      ...exam,
      attemptsUsed: isNewAttempt ? exam.attemptsUsed + 1 : exam.attemptsUsed,
      lastAttempt,
    };
  });
}
